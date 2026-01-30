/**
 * Request Body Extractor
 * Extracts request body schemas using a pattern-based system.
 */
import ts from 'typescript';
import type { PropertySchema, ObjectSchema, ExtractionContext, RequestPattern } from '../types';
import { typeToString, extractPropertiesFromType } from '../utils/type-utils';

// ============================================================================
// Pattern Registry
// ============================================================================

const requestPatterns: RequestPattern[] = [];

/**
 * Register a new request extraction pattern.
 */
export function registerRequestPattern(pattern: RequestPattern): void {
    requestPatterns.push(pattern);
    requestPatterns.sort((a, b) => b.priority - a.priority);
}

/**
 * Clear all registered patterns (useful for testing).
 */
export function clearRequestPatterns(): void {
    requestPatterns.length = 0;
}

// ============================================================================
// Built-in Patterns
// ============================================================================

/**
 * Pattern: JSON body with type assertion
 * Example: const body = (await req.json()) as { x: string, y: number }
 */
const jsonTypeAssertionPattern: RequestPattern = {
    name: 'json-type-assertion',
    priority: 100,
    detect: (node, ctx) => {
        if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
        
        let expr = node.initializer;
        
        // Check for type assertion
        if (!ts.isAsExpression(expr)) return false;
        expr = expr.expression;
        
        // Handle parenthesized expression
        if (ts.isParenthesizedExpression(expr)) {
            expr = expr.expression;
        }
        
        // Check for await req.json()
        if (!ts.isAwaitExpression(expr)) return false;
        const callExpr = expr.expression;
        
        if (!ts.isCallExpression(callExpr)) return false;
        if (!ts.isPropertyAccessExpression(callExpr.expression)) return false;
        
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node as ts.VariableDeclaration;
        const asExpr = varDecl.initializer as ts.AsExpression;
        const assertedType = ctx.checker.getTypeFromTypeNode(asExpr.type);
        return extractPropertiesFromType(ctx.checker, assertedType);
    }
};

/**
 * Pattern: JSON body with destructuring
 * Example: const { x, y } = await req.json()
 */
const jsonDestructuringPattern: RequestPattern = {
    name: 'json-destructuring',
    priority: 90,
    detect: (node, ctx) => {
        if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
        if (!ts.isObjectBindingPattern(node.name)) return false;
        
        let expr = node.initializer;
        
        // Handle type assertion wrapper
        if (ts.isAsExpression(expr)) {
            expr = expr.expression;
        }
        if (ts.isParenthesizedExpression(expr)) {
            expr = expr.expression;
        }
        
        if (!ts.isAwaitExpression(expr)) return false;
        const callExpr = expr.expression;
        
        if (!ts.isCallExpression(callExpr)) return false;
        if (!ts.isPropertyAccessExpression(callExpr.expression)) return false;
        
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node as ts.VariableDeclaration;
        const properties: PropertySchema[] = [];
        
        // Check if there's a type assertion
        let initExpr = varDecl.initializer!;
        if (ts.isAsExpression(initExpr)) {
            const assertedType = ctx.checker.getTypeFromTypeNode(initExpr.type);
            return extractPropertiesFromType(ctx.checker, assertedType);
        }
        
        // Extract from binding pattern
        const bindingPattern = varDecl.name as ts.ObjectBindingPattern;
        for (const element of bindingPattern.elements) {
            if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                const propName = element.name.text;
                const propType = ctx.checker.getTypeAtLocation(element);
                properties.push({
                    name: propName,
                    type: typeToString(ctx.checker, propType),
                    optional: !!element.initializer,
                });
            }
        }
        
        return properties;
    }
};

/**
 * Pattern: FormData extraction
 * Example: const formData = await req.formData(); const file = formData.get("file") as File
 */
const formDataPattern: RequestPattern = {
    name: 'formdata',
    priority: 85,
    detect: (node, ctx) => {
        if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
        
        let expr = node.initializer;
        
        // Handle type assertion
        if (ts.isAsExpression(expr)) {
            expr = expr.expression;
        }
        
        // Check for formData.get("fieldName")
        if (!ts.isCallExpression(expr)) return false;
        if (!ts.isPropertyAccessExpression(expr.expression)) return false;
        if (expr.expression.name.text !== 'get') return false;
        if (expr.arguments.length === 0) return false;
        
        // Check if first arg is a string literal
        return ts.isStringLiteral(expr.arguments[0]);
    },
    extract: (node, ctx) => {
        const varDecl = node as ts.VariableDeclaration;
        let initExpr = varDecl.initializer!;
        let typeHint: string | undefined;
        
        // Get type from assertion
        if (ts.isAsExpression(initExpr)) {
            const typeNode = initExpr.type;
            if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
                typeHint = typeNode.typeName.text;
            }
            initExpr = initExpr.expression;
        }
        
        const callExpr = initExpr as ts.CallExpression;
        const arg = callExpr.arguments[0] as ts.StringLiteral;
        
        return [{
            name: arg.text,
            type: typeHint || 'FormDataEntryValue',
            optional: true,
        }];
    }
};

/**
 * Pattern: Simple JSON body assignment
 * Example: const body = await req.json()
 * This needs to be followed up by checking for later destructuring
 */
const jsonSimplePattern: RequestPattern = {
    name: 'json-simple',
    priority: 50,
    detect: (node, ctx) => {
        if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
        if (!ts.isIdentifier(node.name)) return false;
        
        let expr = node.initializer;
        if (!ts.isAwaitExpression(expr)) return false;
        
        const callExpr = expr.expression;
        if (!ts.isCallExpression(callExpr)) return false;
        if (!ts.isPropertyAccessExpression(callExpr.expression)) return false;
        
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node as ts.VariableDeclaration;
        
        // Check for type annotation
        if (varDecl.type) {
            const annotatedType = ctx.checker.getTypeFromTypeNode(varDecl.type);
            return extractPropertiesFromType(ctx.checker, annotatedType);
        }
        
        // Will be handled by subsequent destructuring pattern
        return [];
    }
};

// Register built-in patterns
registerRequestPattern(jsonTypeAssertionPattern);
registerRequestPattern(jsonDestructuringPattern);
registerRequestPattern(formDataPattern);
registerRequestPattern(jsonSimplePattern);

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract request body schema from a function body.
 */
export function extractRequestBody(
    ctx: ExtractionContext,
    functionBody: ts.Block
): ObjectSchema | undefined {
    const properties: PropertySchema[] = [];
    let bodyVariableName: string | undefined;
    let isFormData = false;
    
    function visit(node: ts.Node) {
        // Try each registered pattern
        for (const pattern of requestPatterns) {
            if (pattern.detect(node, ctx)) {
                const extracted = pattern.extract(node, ctx);
                if (extracted.length > 0) {
                    properties.push(...extracted);
                }
                
                // Track body variable name for later patterns
                if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                    const patternName = pattern.name;
                    if (patternName.startsWith('json')) {
                        bodyVariableName = node.name.text;
                    } else if (patternName === 'formdata') {
                        // Skip - FormData fields are captured directly
                    }
                }
                
                // Track formData detection
                if (pattern.name === 'formdata' || 
                    (ts.isVariableDeclaration(node) && node.initializer && 
                     ts.isAwaitExpression(node.initializer) &&
                     ts.isCallExpression(node.initializer.expression) &&
                     ts.isPropertyAccessExpression(node.initializer.expression.expression) &&
                     node.initializer.expression.expression.name.text === 'formData')) {
                    isFormData = true;
                    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                        bodyVariableName = node.name.text;
                    }
                }
                
                break; // Only use the first matching pattern
            }
        }
        
        // Handle subsequent destructuring: const { x, y } = body
        if (bodyVariableName && !isFormData &&
            ts.isVariableDeclaration(node) && 
            ts.isObjectBindingPattern(node.name) && 
            node.initializer && 
            ts.isIdentifier(node.initializer) &&
            node.initializer.text === bodyVariableName) {
            
            for (const element of node.name.elements) {
                if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                    const propName = element.name.text;
                    const propType = ctx.checker.getTypeAtLocation(element);
                    properties.push({
                        name: propName,
                        type: typeToString(ctx.checker, propType),
                        optional: !!element.initializer,
                    });
                }
            }
        }
        
        ts.forEachChild(node, visit);
    }
    
    visit(functionBody);
    
    // Deduplicate properties
    const uniqueProps = new Map<string, PropertySchema>();
    for (const prop of properties) {
        if (!uniqueProps.has(prop.name)) {
            uniqueProps.set(prop.name, prop);
        }
    }
    
    if (uniqueProps.size > 0) {
        return { properties: Array.from(uniqueProps.values()) };
    }
    
    return undefined;
}
