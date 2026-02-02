"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearProgramCache = void 0;
exports.analyzeRouteFile = analyzeRouteFile;
exports.analyzeApiEndpoints = analyzeApiEndpoints;
/**
 * Route Analyzer - Main Orchestrator
 * Coordinates all extractors to analyze Next.js API routes.
 */
const typescript_1 = __importDefault(require("typescript"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const program_1 = require("./program");
const type_utils_1 = require("./utils/type-utils");
const path_utils_1 = require("./utils/path-utils");
const request_1 = require("./extractors/request");
const response_1 = require("./extractors/response");
const params_1 = require("./extractors/params");
const api_dependencies_1 = require("./extractors/api-dependencies");
const cache_1 = require("../core/cache");
const config_1 = require("../core/config");
// ============================================================================
// Constants
// ============================================================================
const HTTP_METHODS_SET = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);
// ============================================================================
// Single File Analysis
// ============================================================================
/**
 * Analyze a single route file.
 * Uses caching to skip re-analysis of unchanged files.
 */
function analyzeRouteFile(filePath, projectRoot, useCache = true, config = config_1.DEFAULT_CONFIG) {
    const result = { routes: [], errors: [] };
    // Check cache first
    if (useCache) {
        const cached = cache_1.routeCache.get(filePath);
        if (cached) {
            // Convert cached data back to RouteAnalysisResult
            return {
                routes: cached,
                errors: []
            };
        }
    }
    try {
        const root = projectRoot || path_1.default.dirname(filePath);
        const program = (0, program_1.getOrCreateProgram)([filePath], root);
        const sourceFile = program.getSourceFile(filePath);
        if (!sourceFile) {
            result.errors.push(`Could not parse file: ${filePath}`);
            return result;
        }
        const checker = program.getTypeChecker();
        const apiPath = (0, path_utils_1.filePathToRoutePath)(filePath, root);
        // Find exported HTTP method functions
        typescript_1.default.forEachChild(sourceFile, (node) => {
            const route = analyzeNode(node, checker, sourceFile, apiPath, filePath, config);
            if (route) {
                result.routes.push(route);
            }
        });
        // Cache the result if analysis succeeded
        if (useCache && result.routes.length > 0) {
            cache_1.routeCache.set(filePath, result.routes);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error analyzing ${filePath}: ${message}`);
    }
    return result;
}
function analyzeNode(node, checker, sourceFile, apiPath, filePath, config = config_1.DEFAULT_CONFIG) {
    let methodName = null;
    let functionBody = null;
    let functionNode = null;
    // Function Declaration: export async function GET(...)
    if (typescript_1.default.isFunctionDeclaration(node) && node.name && node.body) {
        const name = node.name.text;
        if (HTTP_METHODS_SET.has(name) && hasExportModifier(node)) {
            methodName = name;
            functionBody = node.body;
            functionNode = node;
        }
    }
    // Variable Statement: export const GET = async (...)
    if (typescript_1.default.isVariableStatement(node) && hasExportModifier(node)) {
        for (const decl of node.declarationList.declarations) {
            if (typescript_1.default.isIdentifier(decl.name) && HTTP_METHODS_SET.has(decl.name.text) && decl.initializer) {
                methodName = decl.name.text;
                if (typescript_1.default.isArrowFunction(decl.initializer) && typescript_1.default.isBlock(decl.initializer.body)) {
                    functionBody = decl.initializer.body;
                    functionNode = decl.initializer;
                }
                else if (typescript_1.default.isFunctionExpression(decl.initializer) && decl.initializer.body) {
                    functionBody = decl.initializer.body;
                    functionNode = decl.initializer;
                }
            }
        }
    }
    if (!methodName || !functionBody || !functionNode) {
        return null;
    }
    // Create extraction context
    const variables = (0, type_utils_1.collectVariables)(checker, functionBody);
    const ctx = { checker, sourceFile, variables };
    // Extract all schemas
    const requestBody = (0, request_1.extractRequestBody)(ctx, functionBody);
    const responses = (0, response_1.extractResponses)(ctx, functionBody);
    const queryParams = (0, params_1.extractQueryParams)(ctx, functionBody);
    const dependencies = (0, api_dependencies_1.extractApiDependencies)(ctx, functionBody, sourceFile, config.analysis?.cache ?? true, config);
    return {
        method: methodName,
        path: apiPath,
        filePath,
        requestBody,
        queryParams,
        responses,
        dependencies,
    };
}
function hasExportModifier(node) {
    if (!typescript_1.default.canHaveModifiers(node))
        return false;
    const modifiers = typescript_1.default.getModifiers(node);
    return modifiers?.some(m => m.kind === typescript_1.default.SyntaxKind.ExportKeyword) || false;
}
// ============================================================================
// Project-Wide Analysis
// ============================================================================
/**
 * Analyze all API routes in a project.
 */
async function analyzeApiEndpoints(projectPath, existingConfig) {
    const endpoints = [];
    // Load config if not provided
    let config = existingConfig;
    if (!config) {
        const configResult = (0, config_1.loadConfig)(projectPath);
        config = configResult.ok ? configResult.value : config_1.DEFAULT_CONFIG;
    }
    // Convert relative patterns to absolute globs if needed, or rely on cwd
    // But config.include are globs relative to project root
    const routeFiles = [];
    const includePatterns = config.include || config_1.DEFAULT_CONFIG.include || [];
    for (const pattern of includePatterns) {
        const matches = await (0, glob_1.glob)(pattern, {
            cwd: projectPath,
            absolute: true,
            ignore: config.exclude || config_1.DEFAULT_CONFIG.exclude,
        });
        routeFiles.push(...matches);
    }
    if (routeFiles.length === 0) {
        return endpoints;
    }
    // Clear cache when analyzing a new project
    (0, program_1.clearProgramCache)();
    // Create a program for all files for better type resolution
    const program = (0, program_1.getOrCreateProgram)(routeFiles, projectPath);
    // Analyze each file
    const useAnalysisCache = config.analysis?.cache ?? config_1.DEFAULT_CONFIG.analysis?.cache ?? true;
    for (const filePath of routeFiles) {
        const result = analyzeRouteFile(filePath, projectPath, useAnalysisCache, config);
        for (const route of result.routes) {
            // Group routes by path
            const existingEndpoint = endpoints.find(e => e.path === route.path);
            if (existingEndpoint) {
                // Add method to existing endpoint
                if (!existingEndpoint.methods.includes(route.method)) {
                    existingEndpoint.methods.push(route.method);
                }
                // Merge responses
                for (const response of route.responses) {
                    existingEndpoint.responses.push({
                        statusCode: response.statusCode,
                        isError: response.isError,
                        schema: response.schema.properties,
                    });
                }
            }
            else {
                // Create new endpoint
                const routeParams = (0, path_utils_1.extractRouteParams)(route.path);
                endpoints.push({
                    path: route.path,
                    methods: [route.method],
                    params: routeParams,
                    queryParams: route.queryParams?.properties || [],
                    requestBody: route.requestBody?.properties,
                    responseBody: route.responses[0]?.schema.properties,
                    responses: route.responses.map(r => ({
                        statusCode: r.statusCode,
                        isError: r.isError,
                        schema: r.schema.properties,
                    })),
                    dependencies: route.dependencies,
                    filePath: route.filePath,
                    relativePath: path_1.default.relative(projectPath, route.filePath),
                    lineNumber: 1,
                });
            }
        }
    }
    // Sort endpoints alphabetically by path
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    return endpoints;
}
// ============================================================================
// Exports
// ============================================================================
var program_2 = require("./program");
Object.defineProperty(exports, "clearProgramCache", { enumerable: true, get: function () { return program_2.clearProgramCache; } });
