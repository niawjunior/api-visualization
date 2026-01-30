/**
 * Route Analyzer - Main Orchestrator
 * Coordinates all extractors to analyze Next.js API routes.
 */
import ts from 'typescript';
import path from 'path';
import { glob } from 'glob';
import type { 
    RouteSchema, 
    RouteAnalysisResult, 
    ApiEndpoint, 
    HttpMethod,
    HTTP_METHODS,
    ExtractionContext,
    ROUTE_FILE_PATTERNS,
    IGNORED_DIRS
} from './types';
import { getOrCreateProgram, clearProgramCache } from './program';
import { collectVariables } from './utils/type-utils';
import { filePathToRoutePath, extractRouteParams, findMethodLineNumber } from './utils/path-utils';
import { extractRequestBody } from './extractors/request';
import { extractResponses } from './extractors/response';
import { extractQueryParams, extractRouteParamsFromFunction } from './extractors/params';

// ============================================================================
// Constants
// ============================================================================

const HTTP_METHODS_SET = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);

// ============================================================================
// Single File Analysis
// ============================================================================

/**
 * Analyze a single route file.
 */
export function analyzeRouteFile(filePath: string, projectRoot?: string): RouteAnalysisResult {
    const result: RouteAnalysisResult = { routes: [], errors: [] };
    
    try {
        const root = projectRoot || path.dirname(filePath);
        const program = getOrCreateProgram([filePath], root);
        const sourceFile = program.getSourceFile(filePath);
        
        if (!sourceFile) {
            result.errors.push(`Could not parse file: ${filePath}`);
            return result;
        }
        
        const checker = program.getTypeChecker();
        const apiPath = filePathToRoutePath(filePath, root);
        
        // Find exported HTTP method functions
        ts.forEachChild(sourceFile, (node) => {
            const route = analyzeNode(node, checker, sourceFile, apiPath, filePath);
            if (route) {
                result.routes.push(route);
            }
        });
        
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error analyzing ${filePath}: ${message}`);
    }
    
    return result;
}

function analyzeNode(
    node: ts.Node,
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    apiPath: string,
    filePath: string
): RouteSchema | null {
    let methodName: string | null = null;
    let functionBody: ts.Block | null = null;
    let functionNode: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null;
    
    // Function Declaration: export async function GET(...)
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const name = node.name.text;
        if (HTTP_METHODS_SET.has(name) && hasExportModifier(node)) {
            methodName = name;
            functionBody = node.body;
            functionNode = node;
        }
    }
    
    // Variable Statement: export const GET = async (...)
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
        for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && HTTP_METHODS_SET.has(decl.name.text) && decl.initializer) {
                methodName = decl.name.text;
                
                if (ts.isArrowFunction(decl.initializer) && ts.isBlock(decl.initializer.body)) {
                    functionBody = decl.initializer.body;
                    functionNode = decl.initializer;
                } else if (ts.isFunctionExpression(decl.initializer) && decl.initializer.body) {
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
    const variables = collectVariables(checker, functionBody);
    const ctx: ExtractionContext = { checker, sourceFile, variables };
    
    // Extract all schemas
    const requestBody = extractRequestBody(ctx, functionBody);
    const responses = extractResponses(ctx, functionBody);
    const queryParams = extractQueryParams(ctx, functionBody);
    
    return {
        method: methodName as HttpMethod,
        path: apiPath,
        filePath,
        requestBody,
        queryParams,
        responses,
    };
}

function hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || false;
}

// ============================================================================
// Project-Wide Analysis
// ============================================================================

/**
 * Analyze all API routes in a project.
 */
export async function analyzeApiEndpoints(projectPath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    
    // Find all route files
    const patterns = [
        '**/app/**/route.ts',
        '**/app/**/route.tsx',
        '**/app/**/route.js',
        '**/pages/api/**/*.ts',
        '**/pages/api/**/*.tsx',
        '**/pages/api/**/*.js',
    ];
    
    const ignorePatterns = [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
    ];
    
    const routeFiles: string[] = [];
    
    for (const pattern of patterns) {
        const matches = await glob(pattern, {
            cwd: projectPath,
            absolute: true,
            ignore: ignorePatterns,
        });
        routeFiles.push(...matches);
    }
    
    if (routeFiles.length === 0) {
        return endpoints;
    }
    
    // Clear cache when analyzing a new project
    clearProgramCache();
    
    // Create a program for all files for better type resolution
    const program = getOrCreateProgram(routeFiles, projectPath);
    
    // Analyze each file
    for (const filePath of routeFiles) {
        const result = analyzeRouteFile(filePath, projectPath);
        
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
            } else {
                // Create new endpoint
                const routeParams = extractRouteParams(route.path);
                
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
                    filePath: route.filePath,
                    relativePath: path.relative(projectPath, route.filePath),
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

export { clearProgramCache } from './program';
export type { RouteSchema, RouteAnalysisResult, ApiEndpoint } from './types';
