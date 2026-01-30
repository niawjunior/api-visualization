"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRouteFile = analyzeRouteFile;
exports.analyzeApiEndpoints = analyzeApiEndpoints;
exports.clearProgramCache = clearProgramCache;
/**
 * API Route Schema Analyzer - Production Grade
 *
 * Uses TypeScript Compiler API to extract complete request/response schemas
 * from Next.js API routes with full type inference and variable tracing.
 */
const typescript_1 = __importDefault(require("typescript"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
// ============================================================================
// Constants
// ============================================================================
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
const ROUTE_FILE_PATTERNS = [
    '**/app/**/route.ts',
    '**/app/**/route.tsx',
    '**/app/**/route.js',
    '**/pages/api/**/*.ts',
    '**/pages/api/**/*.tsx',
    '**/pages/api/**/*.js',
];
const IGNORED_DIRS = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
];
// ============================================================================
// TypeScript Program Management
// ============================================================================
let cachedProgram = null;
let cachedProjectRoot = null;
function getOrCreateProgram(files, projectRoot) {
    // Reuse program if same project
    if (cachedProgram && cachedProjectRoot === projectRoot) {
        return cachedProgram;
    }
    const configPath = typescript_1.default.findConfigFile(projectRoot, typescript_1.default.sys.fileExists, 'tsconfig.json');
    let compilerOptions = {
        target: typescript_1.default.ScriptTarget.ESNext,
        module: typescript_1.default.ModuleKind.ESNext,
        moduleResolution: typescript_1.default.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowJs: true,
        resolveJsonModule: true,
    };
    if (configPath) {
        const configFile = typescript_1.default.readConfigFile(configPath, typescript_1.default.sys.readFile);
        if (configFile.config) {
            const parsed = typescript_1.default.parseJsonConfigFileContent(configFile.config, typescript_1.default.sys, projectRoot);
            compilerOptions = { ...compilerOptions, ...parsed.options };
        }
    }
    cachedProgram = typescript_1.default.createProgram(files, compilerOptions);
    cachedProjectRoot = projectRoot;
    return cachedProgram;
}
// ============================================================================
// Type Utilities
// ============================================================================
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
        // Extract just the type name from import paths
        const match = typeString.match(/import\([^)]+\)\.(\w+)/);
        if (match)
            return match[1];
    }
    return typeString;
}
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
function extractPropertiesFromObjectLiteral(checker, node, variables) {
    const properties = [];
    for (const prop of node.properties) {
        // Handle spread properties: { ...object, key: value }
        if (typescript_1.default.isSpreadAssignment(prop)) {
            const spreadExpr = prop.expression;
            // Try to resolve the spread expression type
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
                // Handle complex expressions like { ...await something() }
                const spreadType = checker.getTypeAtLocation(spreadExpr);
                const spreadProps = extractPropertiesFromType(checker, spreadType);
                properties.push(...spreadProps);
            }
            continue;
        }
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
// ============================================================================
// Request Body Extraction
// ============================================================================
function extractRequestBody(checker, functionBody, variables) {
    const properties = [];
    let bodyVariableName;
    let isFormData = false;
    function visit(node) {
        // Pattern 1: const body = await req.json()
        // Pattern 1b: const body = (await req.json()) as Type
        // Pattern 1c: const { x, y } = (await req.json()) as { x: T, y: T }
        if (typescript_1.default.isVariableDeclaration(node) && node.initializer) {
            let initExpr = node.initializer;
            let typeFromAssertion;
            // Handle type assertions: (await req.json()) as Type  OR  (await req.json()) as { ... }
            if (typescript_1.default.isAsExpression(initExpr)) {
                typeFromAssertion = checker.getTypeFromTypeNode(initExpr.type);
                initExpr = initExpr.expression;
            }
            // Handle parenthesized: ((await req.json()) as Type)
            if (typescript_1.default.isParenthesizedExpression(initExpr)) {
                const innerExpr = initExpr.expression;
                if (typescript_1.default.isAsExpression(innerExpr)) {
                    typeFromAssertion = checker.getTypeFromTypeNode(innerExpr.type);
                    initExpr = innerExpr.expression;
                }
                else {
                    initExpr = innerExpr;
                }
            }
            // Now check if it's await req.json()
            if (typescript_1.default.isAwaitExpression(initExpr)) {
                const expr = initExpr.expression;
                if (typescript_1.default.isCallExpression(expr) && typescript_1.default.isPropertyAccessExpression(expr.expression)) {
                    const methodName = expr.expression.name.text;
                    // Handle req.json()
                    if (methodName === 'json') {
                        if (typescript_1.default.isIdentifier(node.name)) {
                            bodyVariableName = node.name.text;
                            // Prefer type from assertion, then type annotation
                            const typeToUse = typeFromAssertion || (node.type ? checker.getTypeFromTypeNode(node.type) : undefined);
                            if (typeToUse) {
                                const typeProps = extractPropertiesFromType(checker, typeToUse);
                                if (typeProps.length > 0) {
                                    properties.push(...typeProps);
                                }
                            }
                        }
                        else if (typescript_1.default.isObjectBindingPattern(node.name)) {
                            // Direct destructuring: const { x, y } = await req.json()
                            // Use type from assertion if available
                            if (typeFromAssertion) {
                                const typeProps = extractPropertiesFromType(checker, typeFromAssertion);
                                properties.push(...typeProps);
                            }
                            else {
                                for (const element of node.name.elements) {
                                    if (typescript_1.default.isBindingElement(element) && typescript_1.default.isIdentifier(element.name)) {
                                        const propName = element.name.text;
                                        const propType = checker.getTypeAtLocation(element);
                                        properties.push({
                                            name: propName,
                                            type: typeToString(checker, propType),
                                            optional: !!element.initializer,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // Handle req.formData()
                    if (methodName === 'formData') {
                        isFormData = true;
                        if (typescript_1.default.isIdentifier(node.name)) {
                            bodyVariableName = node.name.text;
                        }
                    }
                }
            }
        }
        // Pattern 2: const { x, y } = body
        if (typescript_1.default.isVariableDeclaration(node) &&
            typescript_1.default.isObjectBindingPattern(node.name) &&
            node.initializer &&
            typescript_1.default.isIdentifier(node.initializer) &&
            node.initializer.text === bodyVariableName &&
            !isFormData) {
            for (const element of node.name.elements) {
                if (typescript_1.default.isBindingElement(element) && typescript_1.default.isIdentifier(element.name)) {
                    const propName = element.name.text;
                    const propType = checker.getTypeAtLocation(element);
                    properties.push({
                        name: propName,
                        type: typeToString(checker, propType),
                        optional: !!element.initializer,
                    });
                }
            }
        }
        // Pattern 3: FormData - const file = formData.get("fieldName") as File
        if (isFormData && typescript_1.default.isVariableDeclaration(node) && node.initializer) {
            let initExpr = node.initializer;
            let typeHint;
            // Handle type assertions for formData
            if (typescript_1.default.isAsExpression(initExpr)) {
                const typeNode = initExpr.type;
                if (typescript_1.default.isTypeReferenceNode(typeNode) && typescript_1.default.isIdentifier(typeNode.typeName)) {
                    typeHint = typeNode.typeName.text;
                }
                else if (typescript_1.default.isLiteralTypeNode(typeNode)) {
                    typeHint = checker.typeToString(checker.getTypeFromTypeNode(typeNode));
                }
                initExpr = initExpr.expression;
            }
            // Check for formData.get("fieldName")
            if (typescript_1.default.isCallExpression(initExpr) &&
                typescript_1.default.isPropertyAccessExpression(initExpr.expression) &&
                initExpr.expression.name.text === 'get' &&
                initExpr.arguments.length > 0) {
                // Verify it's calling on the formData variable
                const objExpr = initExpr.expression.expression;
                if (typescript_1.default.isIdentifier(objExpr) && objExpr.text === bodyVariableName) {
                    const arg = initExpr.arguments[0];
                    if (typescript_1.default.isStringLiteral(arg)) {
                        const fieldName = arg.text;
                        properties.push({
                            name: fieldName,
                            type: typeHint || 'FormDataEntryValue',
                            optional: true, // FormData fields can be null
                        });
                    }
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
// ============================================================================
// Response Schema Extraction
// ============================================================================
function extractResponses(checker, functionBody, variables) {
    const responses = [];
    const seen = new Set();
    function visit(node) {
        // Find: return NextResponse.json(...) or return Response.json(...)
        if (typescript_1.default.isReturnStatement(node) && node.expression) {
            if (typescript_1.default.isCallExpression(node.expression)) {
                const callExpr = node.expression;
                // Check if it's NextResponse.json() or Response.json()
                if (typescript_1.default.isPropertyAccessExpression(callExpr.expression) &&
                    callExpr.expression.name.text === 'json') {
                    const args = callExpr.arguments;
                    if (args.length > 0) {
                        const responseArg = args[0];
                        const { properties } = resolveExpressionType(checker, responseArg, variables);
                        // Create signature for deduplication
                        const signature = properties.map(p => p.name).sort().join(',');
                        // Check for status code in second argument
                        let statusCode;
                        let isError = false;
                        if (args.length > 1 && typescript_1.default.isObjectLiteralExpression(args[1])) {
                            for (const prop of args[1].properties) {
                                if (typescript_1.default.isPropertyAssignment(prop) &&
                                    typescript_1.default.isIdentifier(prop.name) &&
                                    prop.name.text === 'status' &&
                                    typescript_1.default.isNumericLiteral(prop.initializer)) {
                                    statusCode = parseInt(prop.initializer.text, 10);
                                    isError = statusCode >= 400;
                                }
                            }
                        }
                        // Check if response has 'error' property
                        const hasErrorProp = properties.some(p => p.name === 'error');
                        if (hasErrorProp) {
                            isError = true;
                            if (!statusCode)
                                statusCode = 400; // Assume 400 for error responses
                        }
                        // Deduplicate by signature + isError
                        const key = `${signature}:${isError}`;
                        if (!seen.has(key) && properties.length > 0) {
                            seen.add(key);
                            responses.push({
                                schema: { properties },
                                statusCode,
                                isError,
                            });
                        }
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
    // Sort: success responses first, then errors
    responses.sort((a, b) => {
        if (a.isError !== b.isError)
            return a.isError ? 1 : -1;
        return (a.statusCode || 200) - (b.statusCode || 200);
    });
    return responses;
}
// ============================================================================
// Route Path Utilities
// ============================================================================
function filePathToRoutePath(filePath, rootPath) {
    let relativePath = path_1.default.relative(rootPath, filePath).replace(/\\/g, '/');
    // Handle App Router
    if (relativePath.includes('/route.')) {
        relativePath = relativePath.replace(/\/route\.(ts|tsx|js|jsx)$/, '');
    }
    // Handle app directory prefix
    if (relativePath.startsWith('app/')) {
        relativePath = relativePath.replace(/^app/, '');
    }
    // Handle Pages API
    if (relativePath.startsWith('pages/')) {
        relativePath = relativePath.replace(/^pages/, '');
        relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');
    }
    // Ensure leading slash
    if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath;
    }
    return relativePath;
}
function extractRouteParams(routePath) {
    const params = [];
    const paramRegex = /\[(?:\.\.\.)?(\w+)\]/g;
    let match;
    while ((match = paramRegex.exec(routePath)) !== null) {
        params.push({
            name: match[1],
            type: 'string',
            optional: false,
        });
    }
    return params;
}
function findMethodLineNumber(sourceFile, method) {
    let lineNumber = 1;
    typescript_1.default.forEachChild(sourceFile, (node) => {
        if (typescript_1.default.isFunctionDeclaration(node) && node.name?.text === method) {
            lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        }
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (typescript_1.default.isIdentifier(decl.name) && decl.name.text === method) {
                    lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                }
            }
        }
    });
    return lineNumber;
}
function extractJSDocDescription(sourceFile) {
    const text = sourceFile.getFullText();
    const jsdocMatch = text.match(/\/\*\*\s*\n\s*\*\s*([^\n*]+)/);
    return jsdocMatch ? jsdocMatch[1].trim() : undefined;
}
// ============================================================================
// Main Analysis Functions
// ============================================================================
/**
 * Analyze a single route file
 */
function analyzeRouteFile(filePath, projectRoot) {
    const result = { routes: [], errors: [] };
    try {
        const root = projectRoot || path_1.default.dirname(filePath);
        const program = getOrCreateProgram([filePath], root);
        const sourceFile = program.getSourceFile(filePath);
        if (!sourceFile) {
            result.errors.push(`Could not parse file: ${filePath}`);
            return result;
        }
        const checker = program.getTypeChecker();
        const apiPath = filePathToRoutePath(filePath, root);
        // Find exported HTTP method functions
        typescript_1.default.forEachChild(sourceFile, (node) => {
            // Function declarations: export async function POST(req) { ... }
            if (typescript_1.default.isFunctionDeclaration(node) && node.name && node.body) {
                const methodName = node.name.text.toUpperCase();
                if (HTTP_METHODS.includes(methodName)) {
                    const variables = collectVariables(checker, node.body);
                    const route = {
                        method: methodName,
                        path: apiPath,
                        filePath,
                        responses: extractResponses(checker, node.body, variables),
                    };
                    if (['POST', 'PUT', 'PATCH'].includes(methodName)) {
                        route.requestBody = extractRequestBody(checker, node.body, variables);
                    }
                    result.routes.push(route);
                }
            }
            // Variable declarations: export const POST = async (req) => { ... }
            if (typescript_1.default.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (typescript_1.default.isIdentifier(decl.name) && decl.initializer) {
                        const methodName = decl.name.text.toUpperCase();
                        if (HTTP_METHODS.includes(methodName)) {
                            let body;
                            if (typescript_1.default.isArrowFunction(decl.initializer) && typescript_1.default.isBlock(decl.initializer.body)) {
                                body = decl.initializer.body;
                            }
                            else if (typescript_1.default.isFunctionExpression(decl.initializer) && decl.initializer.body) {
                                body = decl.initializer.body;
                            }
                            if (body) {
                                const variables = collectVariables(checker, body);
                                const route = {
                                    method: methodName,
                                    path: apiPath,
                                    filePath,
                                    responses: extractResponses(checker, body, variables),
                                };
                                if (['POST', 'PUT', 'PATCH'].includes(methodName)) {
                                    route.requestBody = extractRequestBody(checker, body, variables);
                                }
                                result.routes.push(route);
                            }
                        }
                    }
                }
            }
        });
    }
    catch (error) {
        result.errors.push(`Error analyzing ${filePath}: ${error.message}`);
    }
    return result;
}
/**
 * Analyze all API routes in a project
 */
async function analyzeApiEndpoints(rootPath) {
    const endpoints = [];
    // Find all route files
    const files = await (0, glob_1.glob)(ROUTE_FILE_PATTERNS, {
        cwd: rootPath,
        ignore: IGNORED_DIRS,
        absolute: true,
    });
    if (files.length === 0) {
        return endpoints;
    }
    // Create program with all files for better type resolution
    const program = getOrCreateProgram(files, rootPath);
    for (const filePath of files) {
        try {
            const sourceFile = program.getSourceFile(filePath);
            if (!sourceFile)
                continue;
            const checker = program.getTypeChecker();
            const routePath = filePathToRoutePath(filePath, rootPath);
            const params = extractRouteParams(routePath);
            const description = extractJSDocDescription(sourceFile);
            // Collect all methods in this file
            const methods = [];
            let requestBodyProps;
            let allResponses = [];
            const queryParamProps = [];
            let lineNumber = 1;
            // Helper to extract query params from function body
            const extractQueryParams = (body) => {
                const visit = (node) => {
                    // Pattern: searchParams.get('paramName') or request.nextUrl.searchParams.get('paramName')
                    if (typescript_1.default.isCallExpression(node) &&
                        typescript_1.default.isPropertyAccessExpression(node.expression) &&
                        node.expression.name.text === 'get' &&
                        node.arguments.length > 0) {
                        const arg = node.arguments[0];
                        if (typescript_1.default.isStringLiteral(arg)) {
                            const paramName = arg.text;
                            // Avoid duplicates
                            if (!queryParamProps.some(p => p.name === paramName)) {
                                queryParamProps.push({
                                    name: paramName,
                                    type: 'string',
                                    optional: true, // Query params are typically optional
                                });
                            }
                        }
                    }
                    typescript_1.default.forEachChild(node, visit);
                };
                visit(body);
            };
            // Helper to extract Zod schema types from request body
            const extractZodRequestBody = (body) => {
                let zodProps;
                const visit = (node) => {
                    // Pattern: schema.parse(await req.json()) or schema.safeParse(...)
                    if (typescript_1.default.isCallExpression(node) &&
                        typescript_1.default.isPropertyAccessExpression(node.expression)) {
                        const methodName = node.expression.name.text;
                        if (methodName === 'parse' || methodName === 'safeParse') {
                            // Get the type of the schema
                            const schemaExpr = node.expression.expression;
                            const schemaType = checker.getTypeAtLocation(schemaExpr);
                            // Look for z.infer<typeof schema> type or output type
                            const typeStr = checker.typeToString(schemaType);
                            // Try to get the actual object type from Zod schema
                            const props = schemaType.getProperties();
                            for (const prop of props) {
                                if (prop.getName() === '_output' || prop.getName() === '_type') {
                                    const declarations = prop.getDeclarations();
                                    if (declarations && declarations.length > 0) {
                                        const propType = checker.getTypeOfSymbolAtLocation(prop, declarations[0]);
                                        zodProps = extractPropertiesFromType(checker, propType);
                                        if (zodProps.length > 0)
                                            return;
                                    }
                                }
                            }
                        }
                    }
                    typescript_1.default.forEachChild(node, visit);
                };
                visit(body);
                return zodProps;
            };
            typescript_1.default.forEachChild(sourceFile, (node) => {
                // Function declarations
                if (typescript_1.default.isFunctionDeclaration(node) && node.name && node.body) {
                    const methodName = node.name.text.toUpperCase();
                    if (HTTP_METHODS.includes(methodName)) {
                        methods.push(methodName);
                        lineNumber = findMethodLineNumber(sourceFile, node.name.text);
                        const variables = collectVariables(checker, node.body);
                        // Extract query params
                        extractQueryParams(node.body);
                        if (['POST', 'PUT', 'PATCH'].includes(methodName)) {
                            // Try Zod first, then fall back to destructuring
                            const zodBody = extractZodRequestBody(node.body);
                            if (zodBody && zodBody.length > 0) {
                                requestBodyProps = zodBody;
                            }
                            else {
                                const reqBody = extractRequestBody(checker, node.body, variables);
                                if (reqBody)
                                    requestBodyProps = reqBody.properties;
                            }
                        }
                        const responses = extractResponses(checker, node.body, variables);
                        allResponses.push(...responses);
                    }
                }
                // Variable declarations
                if (typescript_1.default.isVariableStatement(node)) {
                    for (const decl of node.declarationList.declarations) {
                        if (typescript_1.default.isIdentifier(decl.name) && decl.initializer) {
                            const methodName = decl.name.text.toUpperCase();
                            if (HTTP_METHODS.includes(methodName)) {
                                methods.push(methodName);
                                lineNumber = findMethodLineNumber(sourceFile, decl.name.text);
                                let body;
                                if (typescript_1.default.isArrowFunction(decl.initializer) && typescript_1.default.isBlock(decl.initializer.body)) {
                                    body = decl.initializer.body;
                                }
                                else if (typescript_1.default.isFunctionExpression(decl.initializer) && decl.initializer.body) {
                                    body = decl.initializer.body;
                                }
                                if (body) {
                                    const variables = collectVariables(checker, body);
                                    // Extract query params
                                    extractQueryParams(body);
                                    if (['POST', 'PUT', 'PATCH'].includes(methodName)) {
                                        const zodBody = extractZodRequestBody(body);
                                        if (zodBody && zodBody.length > 0) {
                                            requestBodyProps = zodBody;
                                        }
                                        else {
                                            const reqBody = extractRequestBody(checker, body, variables);
                                            if (reqBody)
                                                requestBodyProps = reqBody.properties;
                                        }
                                    }
                                    const responses = extractResponses(checker, body, variables);
                                    allResponses.push(...responses);
                                }
                            }
                        }
                    }
                }
            });
            // Deduplicate responses
            const uniqueResponses = allResponses.reduce((acc, resp) => {
                const key = `${resp.statusCode || 'default'}:${resp.isError}`;
                if (!acc.has(key)) {
                    acc.set(key, resp);
                }
                return acc;
            }, new Map());
            const responsesArray = Array.from(uniqueResponses.values());
            const successResponse = responsesArray.find(r => !r.isError);
            if (methods.length > 0) {
                endpoints.push({
                    path: routePath,
                    methods,
                    params,
                    queryParams: queryParamProps,
                    requestBody: requestBodyProps,
                    responseBody: successResponse?.schema.properties,
                    responses: responsesArray.map(r => ({
                        statusCode: r.statusCode,
                        isError: r.isError,
                        schema: r.schema.properties,
                    })),
                    filePath,
                    relativePath: path_1.default.relative(rootPath, filePath),
                    lineNumber,
                    description,
                });
            }
        }
        catch (error) {
            console.error(`Failed to analyze ${filePath}:`, error.message);
        }
    }
    // Sort by path
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    return endpoints;
}
/**
 * Clear the program cache
 */
function clearProgramCache() {
    cachedProgram = null;
    cachedProjectRoot = null;
}
