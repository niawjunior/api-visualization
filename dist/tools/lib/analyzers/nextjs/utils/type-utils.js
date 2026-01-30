"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeToString = typeToString;
exports.extractPropertiesFromType = extractPropertiesFromType;
exports.extractPropertiesFromObjectLiteral = extractPropertiesFromObjectLiteral;
exports.collectVariables = collectVariables;
exports.resolveExpressionType = resolveExpressionType;
/**
 * Type Utilities
 * Helper functions for TypeScript type extraction and conversion.
 */
const typescript_1 = __importDefault(require("typescript"));
// ============================================================================
// Type to String Conversion
// ============================================================================
/**
 * Convert a TypeScript type to a human-readable string representation.
 */
function typeToString(checker, type) {
    // Handle primitive types
    if (type.flags & typescript_1.default.TypeFlags.String)
        return 'string';
    if (type.flags & typescript_1.default.TypeFlags.Number)
        return 'number';
    if (type.flags & typescript_1.default.TypeFlags.Boolean)
        return 'boolean';
    if (type.flags & typescript_1.default.TypeFlags.Null)
        return 'null';
    if (type.flags & typescript_1.default.TypeFlags.Undefined)
        return 'undefined';
    if (type.flags & typescript_1.default.TypeFlags.Any)
        return 'any';
    if (type.flags & typescript_1.default.TypeFlags.Unknown)
        return 'unknown';
    if (type.flags & typescript_1.default.TypeFlags.Void)
        return 'void';
    if (type.flags & typescript_1.default.TypeFlags.Never)
        return 'never';
    // Handle literal types
    if (type.isStringLiteral())
        return `"${type.value}"`;
    if (type.isNumberLiteral())
        return `${type.value}`;
    // Handle array types
    if (checker.isArrayType(type)) {
        const typeArgs = type.typeArguments;
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
        if (match)
            return match[1];
    }
    return typeString;
}
// ============================================================================
// Property Extraction from Types
// ============================================================================
/**
 * Extract property schemas from a TypeScript type.
 */
function extractPropertiesFromType(checker, type) {
    const properties = [];
    // Get apparent properties (handles both interfaces and object literals)
    const props = type.getApparentProperties();
    for (const prop of props) {
        // Skip internal/inherited properties
        if (prop.getName().startsWith('__'))
            continue;
        const declarations = prop.getDeclarations();
        if (!declarations || declarations.length === 0)
            continue;
        const decl = declarations[0];
        const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
        const isOptional = !!(prop.flags & typescript_1.default.SymbolFlags.Optional);
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
function extractPropertiesFromObjectLiteral(checker, node, variables) {
    const properties = [];
    for (const prop of node.properties) {
        // Handle spread properties: { ...object, key: value }
        if (typescript_1.default.isSpreadAssignment(prop)) {
            const spreadExpr = prop.expression;
            if (typescript_1.default.isIdentifier(spreadExpr)) {
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
            }
            else {
                // Handle complex expressions
                const spreadType = checker.getTypeAtLocation(spreadExpr);
                const spreadProps = extractPropertiesFromType(checker, spreadType);
                properties.push(...spreadProps);
            }
            continue;
        }
        // Handle regular property assignments
        if (typescript_1.default.isPropertyAssignment(prop) || typescript_1.default.isShorthandPropertyAssignment(prop)) {
            const name = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : String(prop.name);
            let type = 'unknown';
            if (typescript_1.default.isPropertyAssignment(prop)) {
                const valueType = checker.getTypeAtLocation(prop.initializer);
                type = typeToString(checker, valueType);
            }
            else if (typescript_1.default.isShorthandPropertyAssignment(prop)) {
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
function collectVariables(checker, block) {
    const variables = new Map();
    function visit(node) {
        if (typescript_1.default.isVariableDeclaration(node) && typescript_1.default.isIdentifier(node.name)) {
            const name = node.name.text;
            const type = checker.getTypeAtLocation(node);
            variables.set(name, {
                name,
                type,
                initializer: node.initializer,
            });
        }
        typescript_1.default.forEachChild(node, visit);
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
function resolveExpressionType(checker, expr, variables) {
    // Direct object literal
    if (typescript_1.default.isObjectLiteralExpression(expr)) {
        const type = checker.getTypeAtLocation(expr);
        const properties = extractPropertiesFromObjectLiteral(checker, expr, variables);
        return { type, properties };
    }
    // Variable reference
    if (typescript_1.default.isIdentifier(expr)) {
        const varInfo = variables.get(expr.text);
        if (varInfo) {
            const properties = extractPropertiesFromType(checker, varInfo.type);
            return { type: varInfo.type, properties };
        }
    }
    // Await expression
    if (typescript_1.default.isAwaitExpression(expr)) {
        return resolveExpressionType(checker, expr.expression, variables);
    }
    // Call expression - get return type
    if (typescript_1.default.isCallExpression(expr)) {
        const type = checker.getTypeAtLocation(expr);
        const properties = extractPropertiesFromType(checker, type);
        return { type, properties };
    }
    // Fallback
    const type = checker.getTypeAtLocation(expr);
    const properties = extractPropertiesFromType(checker, type);
    return { type, properties };
}
