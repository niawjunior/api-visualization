/**
 * Next.js Route Analyzer
 * 
 * A modular, AST-based API route analyzer for Next.js projects.
 * 
 * @module analyzers/nextjs
 */

// Dependency Analyzer (for backward compatibility with analyzer registry)
export { nextjsAnalyzer, clearResolutionCache } from './dependency-analyzer';

// Main analysis functions
export { 
    analyzeRouteFile, 
    analyzeApiEndpoints,
    clearProgramCache 
} from './analyzer';

// Types
export type {
    HttpMethod,
    PropertySchema,
    ObjectSchema,
    ResponseSchema,
    RouteSchema,
    ApiEndpoint,
    RouteAnalysisResult,
    ExtractionContext,
    RequestPattern,
    ResponsePattern,
} from './types';

// Constants
export {
    HTTP_METHODS,
    ROUTE_FILE_PATTERNS,
    IGNORED_DIRS,
} from './types';

// Pattern registration (for extensibility)
export {
    registerRequestPattern,
    clearRequestPatterns,
} from './extractors/request';

// Utilities (for custom patterns)
export {
    typeToString,
    extractPropertiesFromType,
    extractPropertiesFromObjectLiteral,
    collectVariables,
    resolveExpressionType,
} from './utils/type-utils';

export {
    filePathToRoutePath,
    extractRouteParams,
    findMethodLineNumber,
} from './utils/path-utils';
