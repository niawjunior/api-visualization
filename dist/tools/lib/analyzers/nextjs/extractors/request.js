"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRequestPattern = registerRequestPattern;
exports.clearRequestPatterns = clearRequestPatterns;
exports.extractRequestBody = extractRequestBody;
/**
 * Request Body Extractor
 * Extracts request body schemas using a pattern-based system.
 */
const typescript_1 = __importDefault(require("typescript"));
const type_utils_1 = require("../utils/type-utils");
// ============================================================================
// Pattern Registry
// ============================================================================
const requestPatterns = [];
/**
 * Register a new request extraction pattern.
 */
function registerRequestPattern(pattern) {
    requestPatterns.push(pattern);
    requestPatterns.sort((a, b) => b.priority - a.priority);
}
/**
 * Clear all registered patterns (useful for testing).
 */
function clearRequestPatterns() {
    requestPatterns.length = 0;
}
// ============================================================================
// Built-in Patterns
// ============================================================================
/**
 * Pattern: JSON body with type assertion
 * Example: const body = (await req.json()) as { x: string, y: number }
 */
const jsonTypeAssertionPattern = {
    name: 'json-type-assertion',
    priority: 100,
    detect: (node, ctx) => {
        if (!typescript_1.default.isVariableDeclaration(node) || !node.initializer)
            return false;
        let expr = node.initializer;
        // Check for type assertion
        if (!typescript_1.default.isAsExpression(expr))
            return false;
        expr = expr.expression;
        // Handle parenthesized expression
        if (typescript_1.default.isParenthesizedExpression(expr)) {
            expr = expr.expression;
        }
        // Check for await req.json()
        if (!typescript_1.default.isAwaitExpression(expr))
            return false;
        const callExpr = expr.expression;
        if (!typescript_1.default.isCallExpression(callExpr))
            return false;
        if (!typescript_1.default.isPropertyAccessExpression(callExpr.expression))
            return false;
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node;
        const asExpr = varDecl.initializer;
        const assertedType = ctx.checker.getTypeFromTypeNode(asExpr.type);
        return (0, type_utils_1.extractPropertiesFromType)(ctx.checker, assertedType);
    }
};
/**
 * Pattern: JSON body with destructuring
 * Example: const { x, y } = await req.json()
 */
const jsonDestructuringPattern = {
    name: 'json-destructuring',
    priority: 90,
    detect: (node, ctx) => {
        if (!typescript_1.default.isVariableDeclaration(node) || !node.initializer)
            return false;
        if (!typescript_1.default.isObjectBindingPattern(node.name))
            return false;
        let expr = node.initializer;
        // Handle type assertion wrapper
        if (typescript_1.default.isAsExpression(expr)) {
            expr = expr.expression;
        }
        if (typescript_1.default.isParenthesizedExpression(expr)) {
            expr = expr.expression;
        }
        if (!typescript_1.default.isAwaitExpression(expr))
            return false;
        const callExpr = expr.expression;
        if (!typescript_1.default.isCallExpression(callExpr))
            return false;
        if (!typescript_1.default.isPropertyAccessExpression(callExpr.expression))
            return false;
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node;
        const properties = [];
        // Check if there's a type assertion
        let initExpr = varDecl.initializer;
        if (typescript_1.default.isAsExpression(initExpr)) {
            const assertedType = ctx.checker.getTypeFromTypeNode(initExpr.type);
            return (0, type_utils_1.extractPropertiesFromType)(ctx.checker, assertedType);
        }
        // Extract from binding pattern
        const bindingPattern = varDecl.name;
        for (const element of bindingPattern.elements) {
            if (typescript_1.default.isBindingElement(element) && typescript_1.default.isIdentifier(element.name)) {
                const propName = element.name.text;
                const propType = ctx.checker.getTypeAtLocation(element);
                properties.push({
                    name: propName,
                    type: (0, type_utils_1.typeToString)(ctx.checker, propType),
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
const formDataPattern = {
    name: 'formdata',
    priority: 85,
    detect: (node, ctx) => {
        if (!typescript_1.default.isVariableDeclaration(node) || !node.initializer)
            return false;
        let expr = node.initializer;
        // Handle type assertion
        if (typescript_1.default.isAsExpression(expr)) {
            expr = expr.expression;
        }
        // Check for formData.get("fieldName")
        if (!typescript_1.default.isCallExpression(expr))
            return false;
        if (!typescript_1.default.isPropertyAccessExpression(expr.expression))
            return false;
        if (expr.expression.name.text !== 'get')
            return false;
        if (expr.arguments.length === 0)
            return false;
        // Check if first arg is a string literal
        return typescript_1.default.isStringLiteral(expr.arguments[0]);
    },
    extract: (node, ctx) => {
        const varDecl = node;
        let initExpr = varDecl.initializer;
        let typeHint;
        // Get type from assertion
        if (typescript_1.default.isAsExpression(initExpr)) {
            const typeNode = initExpr.type;
            if (typescript_1.default.isTypeReferenceNode(typeNode) && typescript_1.default.isIdentifier(typeNode.typeName)) {
                typeHint = typeNode.typeName.text;
            }
            initExpr = initExpr.expression;
        }
        const callExpr = initExpr;
        const arg = callExpr.arguments[0];
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
const jsonSimplePattern = {
    name: 'json-simple',
    priority: 50,
    detect: (node, ctx) => {
        if (!typescript_1.default.isVariableDeclaration(node) || !node.initializer)
            return false;
        if (!typescript_1.default.isIdentifier(node.name))
            return false;
        let expr = node.initializer;
        if (!typescript_1.default.isAwaitExpression(expr))
            return false;
        const callExpr = expr.expression;
        if (!typescript_1.default.isCallExpression(callExpr))
            return false;
        if (!typescript_1.default.isPropertyAccessExpression(callExpr.expression))
            return false;
        return callExpr.expression.name.text === 'json';
    },
    extract: (node, ctx) => {
        const varDecl = node;
        // Check for type annotation
        if (varDecl.type) {
            const annotatedType = ctx.checker.getTypeFromTypeNode(varDecl.type);
            return (0, type_utils_1.extractPropertiesFromType)(ctx.checker, annotatedType);
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
function extractRequestBody(ctx, functionBody) {
    const properties = [];
    let bodyVariableName;
    let isFormData = false;
    function visit(node) {
        // Try each registered pattern
        for (const pattern of requestPatterns) {
            if (pattern.detect(node, ctx)) {
                const extracted = pattern.extract(node, ctx);
                if (extracted.length > 0) {
                    properties.push(...extracted);
                }
                // Track body variable name for later patterns
                if (typescript_1.default.isVariableDeclaration(node) && typescript_1.default.isIdentifier(node.name)) {
                    const patternName = pattern.name;
                    if (patternName.startsWith('json')) {
                        bodyVariableName = node.name.text;
                    }
                    else if (patternName === 'formdata') {
                        // Skip - FormData fields are captured directly
                    }
                }
                // Track formData detection
                if (pattern.name === 'formdata' ||
                    (typescript_1.default.isVariableDeclaration(node) && node.initializer &&
                        typescript_1.default.isAwaitExpression(node.initializer) &&
                        typescript_1.default.isCallExpression(node.initializer.expression) &&
                        typescript_1.default.isPropertyAccessExpression(node.initializer.expression.expression) &&
                        node.initializer.expression.expression.name.text === 'formData')) {
                    isFormData = true;
                    if (typescript_1.default.isVariableDeclaration(node) && typescript_1.default.isIdentifier(node.name)) {
                        bodyVariableName = node.name.text;
                    }
                }
                break; // Only use the first matching pattern
            }
        }
        // Handle subsequent destructuring: const { x, y } = body
        if (bodyVariableName && !isFormData &&
            typescript_1.default.isVariableDeclaration(node) &&
            typescript_1.default.isObjectBindingPattern(node.name) &&
            node.initializer &&
            typescript_1.default.isIdentifier(node.initializer) &&
            node.initializer.text === bodyVariableName) {
            for (const element of node.name.elements) {
                if (typescript_1.default.isBindingElement(element) && typescript_1.default.isIdentifier(element.name)) {
                    const propName = element.name.text;
                    const propType = ctx.checker.getTypeAtLocation(element);
                    properties.push({
                        name: propName,
                        type: (0, type_utils_1.typeToString)(ctx.checker, propType),
                        optional: !!element.initializer,
                    });
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
    // Deduplicate properties
    const uniqueProps = new Map();
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
