/**
 * TypeScript Program Management
 * Handles program creation, caching, and type checker access.
 */
import ts from 'typescript';

// ============================================================================
// Program Cache
// ============================================================================

let cachedProgram: ts.Program | null = null;
let cachedProjectRoot: string | null = null;
let cachedFiles: Set<string> | null = null;

/**
 * Get or create a TypeScript program for analysis.
 * Caches the program to avoid re-parsing for subsequent analyses in the same project.
 */
export function getOrCreateProgram(files: string[], projectRoot: string): ts.Program {
    // Check if we can reuse cached program
    if (cachedProgram && cachedProjectRoot === projectRoot && cachedFiles) {
        // Check if all requested files are in the cache
        const allCached = files.every(f => cachedFiles!.has(f));
        if (allCached) {
            return cachedProgram;
        }
    }
    
    const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = getDefaultCompilerOptions();
    
    if (configPath) {
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        if (configFile.config) {
            const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
            compilerOptions = { ...compilerOptions, ...parsed.options };
        }
    }
    
    // Use incremental build if available
    cachedProgram = ts.createProgram(files, compilerOptions, undefined, cachedProgram || undefined);
    cachedProjectRoot = projectRoot;
    cachedFiles = new Set(files);
    
    return cachedProgram;
}

/**
 * Clear the program cache. Call when switching projects or after significant changes.
 */
export function clearProgramCache(): void {
    cachedProgram = null;
    cachedProjectRoot = null;
    cachedFiles = null;
}

/**
 * Get the cached project root, if any.
 */
export function getCachedProjectRoot(): string | null {
    return cachedProjectRoot;
}

// ============================================================================
// Default Compiler Options
// ============================================================================

function getDefaultCompilerOptions(): ts.CompilerOptions {
    return {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowJs: true,
        resolveJsonModule: true,
    };
}
