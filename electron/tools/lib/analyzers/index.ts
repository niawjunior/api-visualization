/**
 * Analyzers Module - Entry point
 * Exports the public API for dependency analysis
 */

// Core types
export type {
    LanguageAnalyzer,
    ImportMatch,
    DependencyNode,
    DependencyEdge,
    DependencyGraph,
    AnalyzerOptions
} from './types';

// Registry
export { analyzerRegistry } from './registry';

// Core analyzer
export { analyzeDependencies, analyze } from './core';

// Individual analyzers (for direct use if needed)
export { nextjsAnalyzer, clearResolutionCache } from './nextjs';

// Route analyzer
export {
    analyzeRouteFile,
    analyzeApiEndpoints,
    clearProgramCache,
    type RouteSchema,
    type RouteAnalysisResult,
    type PropertySchema,
    type ObjectSchema,
    type ResponseSchema,
    type ApiEndpoint
} from './nextjs';
