/**
 * Next.js/TypeScript Dependency Analyzer
 * Implements LanguageAnalyzer for JavaScript/TypeScript projects.
 */
import fs from 'fs/promises';
import path from 'path';
import type { LanguageAnalyzer, ImportMatch } from '../types';
import {
    ES_IMPORT_FROM_REGEX,
    DYNAMIC_IMPORT_REGEX,
    REQUIRE_REGEX,
    SIDE_EFFECT_IMPORT_REGEX,
    RESOLVABLE_EXTENSIONS,
    INDEX_FILES,
    ALIAS_PREFIXES,
} from './patterns';

// ============================================================================
// Resolution Cache
// ============================================================================

const resolutionCache = new Map<string, string | null>();

/**
 * Clear the import resolution cache.
 */
export function clearResolutionCache(): void {
    resolutionCache.clear();
}

// ============================================================================
// Next.js Analyzer Implementation
// ============================================================================

export const nextjsAnalyzer: LanguageAnalyzer = {
    name: 'nextjs',
    extensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'],
    ignorePatterns: [
        'node_modules/**',
        '.next/**',
        '.git/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '*.d.ts',
        '**/*.test.*',
        '**/*.spec.*',
    ],

    parseImports(content: string, filePath: string): ImportMatch[] {
        const imports: ImportMatch[] = [];

        // ES imports and re-exports
        let match: RegExpExecArray | null;
        const esRegex = new RegExp(ES_IMPORT_FROM_REGEX.source, 'g');
        while ((match = esRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'static',
                });
            }
        }

        // Dynamic imports
        const dynamicRegex = new RegExp(DYNAMIC_IMPORT_REGEX.source, 'g');
        while ((match = dynamicRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'dynamic',
                });
            }
        }

        // Require statements
        const requireRegex = new RegExp(REQUIRE_REGEX.source, 'g');
        while ((match = requireRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'require',
                });
            }
        }

        // Side-effect imports
        const sideEffectRegex = new RegExp(SIDE_EFFECT_IMPORT_REGEX.source, 'g');
        while ((match = sideEffectRegex.exec(content)) !== null) {
            if (match[1]) {
                // Avoid duplicates from ES import regex
                if (!imports.some(i => i.importPath === match![1])) {
                    imports.push({
                        importPath: match[1],
                        importType: 'side-effect',
                    });
                }
            }
        }

        return imports;
    },

    async resolveImport(
        importPath: string,
        fromFile: string,
        projectRoot: string
    ): Promise<string | null> {
        // Check cache
        const cacheKey = `${fromFile}:${importPath}`;
        if (resolutionCache.has(cacheKey)) {
            return resolutionCache.get(cacheKey)!;
        }

        const result = await doResolveImport(importPath, fromFile, projectRoot);
        resolutionCache.set(cacheKey, result);
        return result;
    },
};

// ============================================================================
// Import Resolution Logic
// ============================================================================

async function doResolveImport(
    importPath: string,
    fromFile: string,
    projectRoot: string
): Promise<string | null> {
    // Skip external packages
    if (isExternalPackage(importPath)) {
        return null;
    }

    // Handle relative imports
    if (importPath.startsWith('.')) {
        const dir = path.dirname(fromFile);
        const resolved = path.resolve(dir, importPath);
        return await tryResolve(resolved);
    }

    // Handle alias imports (@/, ~/, #/)
    for (const prefix of ALIAS_PREFIXES) {
        if (importPath.startsWith(prefix)) {
            const aliasPath = importPath.slice(prefix.length);
            const resolved = path.join(projectRoot, aliasPath);
            return await tryResolve(resolved);
        }
    }

    // Unresolved - likely external
    return null;
}

function isExternalPackage(importPath: string): boolean {
    // External if not relative and doesn't start with an alias
    if (importPath.startsWith('.')) return false;
    for (const prefix of ALIAS_PREFIXES) {
        if (importPath.startsWith(prefix)) return false;
    }
    return true;
}

async function tryResolve(basePath: string): Promise<string | null> {
    // Try exact path
    if (await fileExists(basePath)) {
        return basePath;
    }

    // Try with extensions
    for (const ext of RESOLVABLE_EXTENSIONS) {
        const withExt = `${basePath}.${ext}`;
        if (await fileExists(withExt)) {
            return withExt;
        }
    }

    // Try as directory with index file
    for (const indexFile of INDEX_FILES) {
        const indexPath = path.join(basePath, indexFile);
        if (await fileExists(indexPath)) {
            return indexPath;
        }
    }

    return null;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch {
        return false;
    }
}
