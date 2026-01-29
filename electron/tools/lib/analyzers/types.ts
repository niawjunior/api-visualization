/**
 * Core types for the modular dependency analysis system.
 * These interfaces are language-agnostic and define the plugin contract.
 */

/**
 * Represents a single import found in source code
 */
export interface ImportMatch {
    /** Raw import path as written in source (e.g., "@/lib/utils", "./helper", "lodash") */
    importPath: string;
    /** Type of import statement */
    importType: 'static' | 'dynamic' | 'side-effect' | 'require' | 'other';
    /** Line number where import was found (optional) */
    line?: number;
}

/**
 * Interface that all language analyzers must implement
 */
export interface LanguageAnalyzer {
    /** Unique name for this analyzer */
    name: string;
    /** File extensions this analyzer handles (without dot, e.g., ["ts", "tsx"]) */
    extensions: string[];
    /** Directories to ignore when scanning */
    ignorePatterns: string[];

    /**
     * Parse import statements from file content
     * @param content - File content as string
     * @param filePath - Absolute path to the file being parsed
     * @returns Array of import matches found
     */
    parseImports(content: string, filePath: string): ImportMatch[];

    /**
     * Resolve an import path to an absolute file path
     * @param importPath - The import string (e.g., "@/lib/utils")
     * @param fromFile - Absolute path of the file containing the import
     * @param projectRoot - Root directory of the project
     * @returns Resolved absolute path, or null if external/unresolvable
     */
    resolveImport(
        importPath: string,
        fromFile: string,
        projectRoot: string
    ): Promise<string | null>;
}

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
    id: string;
    label: string;
    type: 'file' | 'package' | 'external';
    isExternal?: boolean;
}

/**
 * Edge in the dependency graph (import relationship)
 */
export interface DependencyEdge {
    source: string;
    target: string;
}

/**
 * Result of dependency analysis
 */
export interface DependencyGraph {
    nodes: DependencyNode[];
    edges: DependencyEdge[];
}

/**
 * Options for the core analyzer
 */
export interface AnalyzerOptions {
    /** Root path to scan */
    scanPath: string;
    /** Project root for alias resolution (defaults to scanPath) */
    projectRoot?: string;
    /** Maximum depth for recursive scanning */
    maxDepth?: number;
}
