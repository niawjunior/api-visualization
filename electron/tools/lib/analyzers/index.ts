/**
 * Analyzers Module - Entry point
 * Exports the public API for dependency analysis and API endpoint analysis.
 */

import { apiAnalyzerRegistry } from './core/registry';
import { nextJsFrameworkAnalyzer } from './nextjs';
import { pythonFrameworkAnalyzer } from './python';
import { loadConfig, DEFAULT_CONFIG } from './core/config';
import { ApiEndpoint } from './core/api-types';

// Register built-in analyzers
apiAnalyzerRegistry.register(nextJsFrameworkAnalyzer);
apiAnalyzerRegistry.register(pythonFrameworkAnalyzer);

// Core types & exports
export * from './core/api-types';
export * from './core/analyzer';
export * from './core/config';
export { apiAnalyzerRegistry } from './core/registry';

// Core types for Dependency Graph (Legacy/Separate system)
export type {
    LanguageAnalyzer,
    ImportMatch,
    DependencyNode,
    DependencyEdge,
    DependencyGraph,
    AnalyzerOptions
} from './types';

// Registry (Dependency Graph)
export { analyzerRegistry } from './registry';
export { analyzeDependencies, analyze } from './core';

// Individual analyzers (for direct use if needed)
export { nextjsAnalyzer, clearResolutionCache } from './nextjs';

// Route analyzer implementation (Direct access)
export {
    analyzeRouteFile,
    analyzeApiEndpoints, // Specific Next.js implementation
    clearProgramCache,
    type RouteSchema,
    type RouteAnalysisResult,
    type PropertySchema,
    type ObjectSchema,
    type ResponseSchema,
    type ApiEndpoint
} from './nextjs';

/**
 * Universal Project Analyzer
 * Auto-detects the framework and runs the appropriate analyzer.
 */
export async function analyzeProject(projectPath: string): Promise<ApiEndpoint[]> {
    const configResult = loadConfig(projectPath);
    const config = configResult.ok ? configResult.value : DEFAULT_CONFIG;
    
    // Auto-detect analyzer via Registry
    const analyzer = await apiAnalyzerRegistry.detect(projectPath, config);
    
    if (!analyzer) {
        // Fallback or error? For now, if we can't detect, maybe default to nextjs if it looks like a web project? 
        // Or throw error.
        // Let's try Next.js as default fallthrough if no other matched? 
        // No, detect() usually requires positive match.
        // If nothing matches, we return empty list or error.
        console.warn(`No specific framework detected for ${projectPath}`);
        return [];
    }
    
    return analyzer.analyze(projectPath, config);
}
