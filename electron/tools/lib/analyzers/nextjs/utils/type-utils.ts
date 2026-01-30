/**
 * Type Utilities
 * Helper functions for TypeScript type extraction and conversion.
 */
import ts from 'typescript';
import type { PropertySchema, VariableInfo } from '../types';

// ============================================================================
// Type to String Conversion
// ============================================================================

/**
 * Convert a TypeScript type to a human-readable string representation.
 */
export function typeToString(checker: ts.TypeChecker, type: ts.Type): string {
    // Handle primitive types
    if (type.flags & ts.TypeFlags.String) return 'string';
    if (type.flags & ts.TypeFlags.Number) return 'number';
    if (type.flags & ts.TypeFlags.Boolean) return 'boolean';
    if (type.flags & ts.TypeFlags.Null) return 'null';
    if (type.flags & ts.TypeFlags.Undefined) return 'undefined';
    if (type.flags & ts.TypeFlags.Any) return 'any';
    if (type.flags & ts.TypeFlags.Unknown) return 'unknown';
    if (type.flags & ts.TypeFlags.Void) return 'void';
    if (type.flags & ts.TypeFlags.Never) return 'never';
    
    // Handle literal types
    if (type.isStringLiteral()) return `"${type.value}"`;
    if (type.isNumberLiteral()) return `${type.value}`;
    
    // Handle array types
    if (checker.isArrayType(type)) {
        const typeArgs = (type as ts.TypeReference).typeArguments;
        if (typeArgs && typeArgs.length > 0) {
            return `${typeToString(checker, typeArgs[0])}[]`;
        }
        return 'any[]';
    }
    
    // Handle union types
    if (type.isUnion()) {
        return type.types.map(t => typeToString(checker, t)).join(' | ');
    }
    
    // Handle object types - get a cleaner representation
    const typeString = checker.typeToString(type);
    
    // Clean up common noise
    if (typeString.includes('import(')) {
        const match = typeString.match(/import\([^)]+\)\.(\w+)/);
        if (match) return match[1];
    }
    
    return typeString;
}

// ============================================================================
// Property Extraction from Types
// ============================================================================

/**
 * Extract property schemas from a TypeScript type.
 */
export function extractPropertiesFromType(checker: ts.TypeChecker, type: ts.Type): PropertySchema[] {
    const properties: PropertySchema[] = [];
    
    // Get apparent properties (handles both interfaces and object literals)
    const props = type.getApparentProperties();
    
    for (const prop of props) {
        // Skip internal/inherited properties
        if (prop.getName().startsWith('__')) continue;
        
        const declarations = prop.getDeclarations();
        if (!declarations || declarations.length === 0) continue;
        
        const decl = declarations[0];
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
        
        // Get JSDoc description if available
        const jsDocTags = prop.getJsDocTags();
        const description = jsDocTags.find(t => t.name === 'description')?.text?.[0]?.text;
        
        properties.push({
            name: prop.getName(),
            type: typeToString(checker, propType),
            optional: isOptional,
            description,
        });
    }
    
    return properties;
}

/**
 * Extract property schemas from an object literal expression.
 * Handles spread properties and nested objects.
 */
export function extractPropertiesFromObjectLiteral(
    checker: ts.TypeChecker, 
    node: ts.ObjectLiteralExpression,
    variables?: Map<string, VariableInfo>
): PropertySchema[] {
    const properties: PropertySchema[] = [];
    
    for (const prop of node.properties) {
        // Handle spread properties: { ...object, key: value }
        if (ts.isSpreadAssignment(prop)) {
            const spreadExpr = prop.expression;
            
            if (ts.isIdentifier(spreadExpr)) {
                // Look up in variables first
                if (variables) {
                    const varInfo = variables.get(spreadExpr.text);
                    if (varInfo) {
                        const spreadProps = extractPropertiesFromType(checker, varInfo.type);
                        properties.push(...spreadProps);
                        continue;
                    }
                }
                // Fall back to type at location
                const spreadType = checker.getTypeAtLocation(spreadExpr);
                const spreadProps = extractPropertiesFromType(checker, spreadType);
                properties.push(...spreadProps);
            } else {
                // Handle complex expressions
                const spreadType = checker.getTypeAtLocation(spreadExpr);
                const spreadProps = extractPropertiesFromType(checker, spreadType);
                properties.push(...spreadProps);
            }
            continue;
        }
        
        // Handle regular property assignments
        if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
            const name = ts.isIdentifier(prop.name) ? prop.name.text : String(prop.name);
            
            let type = 'unknown';
            if (ts.isPropertyAssignment(prop)) {
                const valueType = checker.getTypeAtLocation(prop.initializer);
                type = typeToString(checker, valueType);
            } else if (ts.isShorthandPropertyAssignment(prop)) {
                const valueType = checker.getTypeAtLocation(prop.name);
                type = typeToString(checker, valueType);
            }
            
            properties.push({
                name,
                type,
                optional: false,
            });
        }
    }
    
    return properties;
}

// ============================================================================
// Variable Collection
// ============================================================================

/**
 * Collect all variable declarations from a function body.
 */
export function collectVariables(
    checker: ts.TypeChecker,
    block: ts.Block
): Map<string, VariableInfo> {
    const variables = new Map<string, VariableInfo>();
    
    function visit(node: ts.Node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const type = checker.getTypeAtLocation(node);
            variables.set(name, {
                name,
                type,
                initializer: node.initializer,
            });
        }
        ts.forEachChild(node, visit);
    }
    
    visit(block);
    return variables;
}

// ============================================================================
// Expression Resolution
// ============================================================================

/**
 * Resolve the type and properties of an expression, following variable references.
 */
export function resolveExpressionType(
    checker: ts.TypeChecker,
    expr: ts.Expression,
    variables: Map<string, VariableInfo>
): { type: ts.Type; properties: PropertySchema[] } {
    // Direct object literal
    if (ts.isObjectLiteralExpression(expr)) {
        const type = checker.getTypeAtLocation(expr);
        const properties = extractPropertiesFromObjectLiteral(checker, expr, variables);
        return { type, properties };
    }
    
    // Variable reference
    if (ts.isIdentifier(expr)) {
        const varInfo = variables.get(expr.text);
        if (varInfo) {
            const properties = extractPropertiesFromType(checker, varInfo.type);
            return { type: varInfo.type, properties };
        }
    }
    
    // Await expression
    if (ts.isAwaitExpression(expr)) {
        return resolveExpressionType(checker, expr.expression, variables);
    }
    
    // Call expression - get return type
    if (ts.isCallExpression(expr)) {
        const type = checker.getTypeAtLocation(expr);
        const properties = extractPropertiesFromType(checker, type);
        return { type, properties };
    }
    
    // Fallback
    const type = checker.getTypeAtLocation(expr);
    const properties = extractPropertiesFromType(checker, type);
    return { type, properties };
}
