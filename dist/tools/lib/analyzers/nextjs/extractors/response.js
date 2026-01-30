"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractResponses = extractResponses;
exports.detectZodSchema = detectZodSchema;
/**
 * Response Schema Extractor
 * Extracts response schemas from NextResponse.json() calls.
 */
const typescript_1 = __importDefault(require("typescript"));
const type_utils_1 = require("../utils/type-utils");
// ============================================================================
// Main Extraction Function
// ============================================================================
/**
 * Extract all response schemas from a function body.
 * Returns an array sorted with success responses first, then errors.
 */
function extractResponses(ctx, functionBody) {
    const responses = [];
    const seen = new Set();
    function visit(node) {
        // Find: return NextResponse.json(...) or return Response.json(...)
        if (typescript_1.default.isReturnStatement(node) && node.expression) {
            const responseSchema = extractResponseFromReturn(node, ctx);
            if (responseSchema) {
                // Deduplicate by signature
                const key = generateSignatureKey(responseSchema);
                if (!seen.has(key)) {
                    seen.add(key);
                    responses.push(responseSchema);
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
    // Sort: success responses first, then errors by status code
    responses.sort((a, b) => {
        if (a.isError !== b.isError)
            return a.isError ? 1 : -1;
        return (a.statusCode || 200) - (b.statusCode || 200);
    });
    return responses;
}
// ============================================================================
// Response Extraction Logic
// ============================================================================
function extractResponseFromReturn(node, ctx) {
    const expr = node.expression;
    if (!expr || !typescript_1.default.isCallExpression(expr))
        return null;
    // Check if it's NextResponse.json() or Response.json()
    if (!typescript_1.default.isPropertyAccessExpression(expr.expression))
        return null;
    if (expr.expression.name.text !== 'json')
        return null;
    const args = expr.arguments;
    if (args.length === 0)
        return null;
    const responseArg = args[0];
    const { properties } = (0, type_utils_1.resolveExpressionType)(ctx.checker, responseArg, ctx.variables);
    if (properties.length === 0)
        return null;
    // Extract status code and error state
    let statusCode;
    let isError = false;
    if (args.length > 1 && typescript_1.default.isObjectLiteralExpression(args[1])) {
        const statusInfo = extractStatusFromOptions(args[1]);
        statusCode = statusInfo.statusCode;
        isError = statusInfo.isError;
    }
    // Check if response has 'error' property
    const hasErrorProp = properties.some(p => p.name === 'error');
    if (hasErrorProp && !isError) {
        isError = true;
        if (!statusCode)
            statusCode = 400;
    }
    return {
        schema: { properties },
        statusCode,
        isError,
    };
}
function extractStatusFromOptions(options) {
    for (const prop of options.properties) {
        if (typescript_1.default.isPropertyAssignment(prop) &&
            typescript_1.default.isIdentifier(prop.name) &&
            prop.name.text === 'status' &&
            typescript_1.default.isNumericLiteral(prop.initializer)) {
            const statusCode = parseInt(prop.initializer.text, 10);
            return {
                statusCode,
                isError: statusCode >= 400
            };
        }
    }
    return { isError: false };
}
function generateSignatureKey(response) {
    const signature = response.schema.properties.map(p => p.name).sort().join(',');
    return `${signature}:${response.isError}:${response.statusCode || 'default'}`;
}
// ============================================================================
// Zod Schema Detection
// ============================================================================
/**
 * Check if a node is a Zod parse/safeParse call and extract the schema.
 */
function detectZodSchema(node, ctx) {
    if (!typescript_1.default.isCallExpression(node))
        return null;
    const expr = node.expression;
    if (!typescript_1.default.isPropertyAccessExpression(expr))
        return null;
    const methodName = expr.name.text;
    if (methodName !== 'parse' && methodName !== 'safeParse')
        return null;
    // Get the type of the schema (the object on which parse/safeParse is called)
    const schemaExpr = expr.expression;
    const schemaType = ctx.checker.getTypeAtLocation(schemaExpr);
    // Try to get the inferred output type
    const typeString = ctx.checker.typeToString(schemaType);
    // For Zod schemas, the type usually has an _output property
    const symbol = schemaType.getProperty('_output');
    if (symbol) {
        const decl = symbol.getDeclarations()?.[0];
        if (decl) {
            const outputType = ctx.checker.getTypeOfSymbolAtLocation(symbol, decl);
            const props = outputType.getApparentProperties();
            const properties = [];
            for (const prop of props) {
                if (prop.getName().startsWith('__'))
                    continue;
                const propDecl = prop.getDeclarations()?.[0];
                if (!propDecl)
                    continue;
                const propType = ctx.checker.getTypeOfSymbolAtLocation(prop, propDecl);
                properties.push({
                    name: prop.getName(),
                    type: ctx.checker.typeToString(propType),
                    optional: !!(prop.flags & typescript_1.default.SymbolFlags.Optional),
                });
            }
            if (properties.length > 0) {
                return properties;
            }
        }
    }
    return null;
}
