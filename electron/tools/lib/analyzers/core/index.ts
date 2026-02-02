/**
 * Core utilities for API analysis
 * These are framework-agnostic building blocks
 */

// Result type for error handling
export type { Result, AnalysisError } from './result';
export {
    AnalysisErrorCode,
    ok,
    err,
    analysisError,
    tryCatch,
    tryCatchAsync,
    collectResults,
} from './result';

// Caching layer
export {
    AnalysisCache,
    dependencyCache,
    routeCache,
    sourceFileCache,
    clearAllCaches,
    getAllCacheStats,
} from './cache';

// Configuration
export type { ApiVizConfig } from './config';
export {
    DEFAULT_CONFIG,
    loadConfig,
    matchesPattern,
} from './config';
