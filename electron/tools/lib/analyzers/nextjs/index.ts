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

// Framework Analyzer Implementation
import { analyzeApiEndpoints } from './analyzer';
import { ApiAnalyzer } from '../core/analyzer';
import { ApiVizConfig } from '../core/config';
import fs from 'fs';
import path from 'path';

export const nextJsFrameworkAnalyzer: ApiAnalyzer = {
    name: 'nextjs',
    detect: async (projectPath: string, config: ApiVizConfig): Promise<boolean> => {
        // Simple detection: check for next.config.js or usage of next dependency
        // We can check package.json too, but file existence is fast
        const hasConfig = fs.existsSync(path.join(projectPath, 'next.config.js')) || 
                          fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
                          fs.existsSync(path.join(projectPath, 'next.config.ts'));
        
        if (hasConfig) return true;
        
        // Fallback: check directories
        return fs.existsSync(path.join(projectPath, 'pages/api')) || 
               fs.existsSync(path.join(projectPath, 'app'));
    },
    analyze: async (projectPath: string, config: ApiVizConfig) => {
        return analyzeApiEndpoints(projectPath, config);
    }
};
