"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractQueryParams = extractQueryParams;
exports.extractRouteParamsFromFunction = extractRouteParamsFromFunction;
/**
 * Parameter Extractor
 * Extracts query parameters and route parameters from handlers.
 */
const typescript_1 = __importDefault(require("typescript"));
const type_utils_1 = require("../utils/type-utils");
// ============================================================================
// Query Parameter Extraction
// ============================================================================
/**
 * Extract query parameters from searchParams.get() calls.
 */
function extractQueryParams(ctx, functionBody) {
    const properties = [];
    function visit(node) {
        // Pattern: searchParams.get("paramName")
        if (typescript_1.default.isCallExpression(node)) {
            const param = extractSearchParamGet(node, ctx);
            if (param) {
                properties.push(param);
            }
        }
        // Pattern: url.searchParams.get("paramName")
        if (typescript_1.default.isCallExpression(node)) {
            const param = extractUrlSearchParamGet(node, ctx);
            if (param) {
                properties.push(param);
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
    // Deduplicate
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
function extractSearchParamGet(node, ctx) {
    const expr = node.expression;
    if (!typescript_1.default.isPropertyAccessExpression(expr))
        return null;
    if (expr.name.text !== 'get')
        return null;
    if (node.arguments.length === 0)
        return null;
    const arg = node.arguments[0];
    if (!typescript_1.default.isStringLiteral(arg))
        return null;
    // Check if it's on searchParams
    const objExpr = expr.expression;
    if (!typescript_1.default.isIdentifier(objExpr))
        return null;
    const objName = objExpr.text.toLowerCase();
    if (!objName.includes('searchparams') && !objName.includes('params')) {
        return null;
    }
    return {
        name: arg.text,
        type: 'string | null',
        optional: true,
    };
}
function extractUrlSearchParamGet(node, ctx) {
    const expr = node.expression;
    if (!typescript_1.default.isPropertyAccessExpression(expr))
        return null;
    if (expr.name.text !== 'get')
        return null;
    if (node.arguments.length === 0)
        return null;
    // Check for url.searchParams pattern
    const objExpr = expr.expression;
    if (!typescript_1.default.isPropertyAccessExpression(objExpr))
        return null;
    if (objExpr.name.text !== 'searchParams')
        return null;
    const arg = node.arguments[0];
    if (!typescript_1.default.isStringLiteral(arg))
        return null;
    return {
        name: arg.text,
        type: 'string | null',
        optional: true,
    };
}
// ============================================================================
// Route Parameter Extraction (from function parameters)
// ============================================================================
/**
 * Extract route parameters from function parameters.
 * Example: async function GET(req: Request, { params }: { params: { id: string } })
 */
function extractRouteParamsFromFunction(ctx, functionNode) {
    const properties = [];
    const params = functionNode.parameters;
    if (params.length < 2)
        return properties;
    // Second parameter usually contains { params }
    const secondParam = params[1];
    // Check for destructuring: { params }
    if (typescript_1.default.isObjectBindingPattern(secondParam.name)) {
        for (const element of secondParam.name.elements) {
            if (typescript_1.default.isBindingElement(element) &&
                typescript_1.default.isIdentifier(element.name) &&
                element.name.text === 'params') {
                // Get the type of params
                const paramsType = ctx.checker.getTypeAtLocation(element);
                const paramsProps = paramsType.getApparentProperties();
                for (const prop of paramsProps) {
                    if (prop.getName().startsWith('__'))
                        continue;
                    const decl = prop.getDeclarations()?.[0];
                    if (!decl)
                        continue;
                    const propType = ctx.checker.getTypeOfSymbolAtLocation(prop, decl);
                    properties.push({
                        name: prop.getName(),
                        type: (0, type_utils_1.typeToString)(ctx.checker, propType),
                        optional: !!(prop.flags & typescript_1.default.SymbolFlags.Optional),
                    });
                }
            }
        }
    }
    return properties;
}
