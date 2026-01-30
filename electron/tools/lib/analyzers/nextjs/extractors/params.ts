/**
 * Parameter Extractor
 * Extracts query parameters and route parameters from handlers.
 */
import ts from 'typescript';
import type { PropertySchema, ObjectSchema, ExtractionContext } from '../types';
import { typeToString } from '../utils/type-utils';

// ============================================================================
// Query Parameter Extraction
// ============================================================================

/**
 * Extract query parameters from searchParams.get() calls.
 */
export function extractQueryParams(
    ctx: ExtractionContext,
    functionBody: ts.Block
): ObjectSchema | undefined {
    const properties: PropertySchema[] = [];
    
    function visit(node: ts.Node) {
        // Pattern: searchParams.get("paramName")
        if (ts.isCallExpression(node)) {
            const param = extractSearchParamGet(node, ctx);
            if (param) {
                properties.push(param);
            }
        }
        
        // Pattern: url.searchParams.get("paramName")
        if (ts.isCallExpression(node)) {
            const param = extractUrlSearchParamGet(node, ctx);
            if (param) {
                properties.push(param);
            }
        }
        
        ts.forEachChild(node, visit);
    }
    
    visit(functionBody);
    
    // Deduplicate
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

function extractSearchParamGet(
    node: ts.CallExpression,
    ctx: ExtractionContext
): PropertySchema | null {
    const expr = node.expression;
    
    if (!ts.isPropertyAccessExpression(expr)) return null;
    if (expr.name.text !== 'get') return null;
    if (node.arguments.length === 0) return null;
    
    const arg = node.arguments[0];
    if (!ts.isStringLiteral(arg)) return null;
    
    // Check if it's on searchParams
    const objExpr = expr.expression;
    if (!ts.isIdentifier(objExpr)) return null;
    
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

function extractUrlSearchParamGet(
    node: ts.CallExpression,
    ctx: ExtractionContext
): PropertySchema | null {
    const expr = node.expression;
    
    if (!ts.isPropertyAccessExpression(expr)) return null;
    if (expr.name.text !== 'get') return null;
    if (node.arguments.length === 0) return null;
    
    // Check for url.searchParams pattern
    const objExpr = expr.expression;
    if (!ts.isPropertyAccessExpression(objExpr)) return null;
    if (objExpr.name.text !== 'searchParams') return null;
    
    const arg = node.arguments[0];
    if (!ts.isStringLiteral(arg)) return null;
    
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
export function extractRouteParamsFromFunction(
    ctx: ExtractionContext,
    functionNode: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression
): PropertySchema[] {
    const properties: PropertySchema[] = [];
    const params = functionNode.parameters;
    
    if (params.length < 2) return properties;
    
    // Second parameter usually contains { params }
    const secondParam = params[1];
    
    // Check for destructuring: { params }
    if (ts.isObjectBindingPattern(secondParam.name)) {
        for (const element of secondParam.name.elements) {
            if (ts.isBindingElement(element) && 
                ts.isIdentifier(element.name) &&
                element.name.text === 'params') {
                
                // Get the type of params
                const paramsType = ctx.checker.getTypeAtLocation(element);
                const paramsProps = paramsType.getApparentProperties();
                
                for (const prop of paramsProps) {
                    if (prop.getName().startsWith('__')) continue;
                    const decl = prop.getDeclarations()?.[0];
                    if (!decl) continue;
                    
                    const propType = ctx.checker.getTypeOfSymbolAtLocation(prop, decl);
                    properties.push({
                        name: prop.getName(),
                        type: typeToString(ctx.checker, propType),
                        optional: !!(prop.flags & ts.SymbolFlags.Optional),
                    });
                }
            }
        }
    }
    
    return properties;
}
