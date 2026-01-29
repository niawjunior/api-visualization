/**
 * Next.js / JavaScript / TypeScript Analyzer
 * Handles import parsing and resolution for JS/TS ecosystem
 */
import fs from 'fs/promises';
import path from 'path';
import { LanguageAnalyzer, ImportMatch } from '../types';
import {
    ES_IMPORT_FROM_REGEX,
    DYNAMIC_IMPORT_REGEX,
    REQUIRE_REGEX,
    SIDE_EFFECT_IMPORT_REGEX,
    RESOLVABLE_EXTENSIONS,
    INDEX_FILES,
    ALIAS_PREFIXES
} from './patterns';

/**
 * Cache for file existence checks
 */
const existenceCache = new Map<string, string | null>();

/**
 * Resolve a path on disk, trying extensions and index files
 */
async function resolvePathOnDisk(absPath: string): Promise<string | null> {
    if (existenceCache.has(absPath)) {
        return existenceCache.get(absPath)!;
    }

    // Check exact path
    try {
        const stats = await fs.stat(absPath);
        if (stats.isFile()) {
            existenceCache.set(absPath, absPath);
            return absPath;
        }
    } catch {}

    // Try with extensions
    for (const ext of RESOLVABLE_EXTENSIONS) {
        const p = `${absPath}.${ext}`;
        try {
            if ((await fs.stat(p)).isFile()) {
                existenceCache.set(absPath, p);
                return p;
            }
        } catch {}
    }

    // Try index files
    for (const indexFile of INDEX_FILES) {
        const p = path.join(absPath, indexFile);
        try {
            if ((await fs.stat(p)).isFile()) {
                existenceCache.set(absPath, p);
                return p;
            }
        } catch {}
    }

    existenceCache.set(absPath, null);
    return null;
}

/**
 * Next.js/TypeScript/JavaScript Analyzer
 */
export const nextjsAnalyzer: LanguageAnalyzer = {
    name: 'nextjs',
    extensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'],
    ignorePatterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/.output/**',
        '**/coverage/**'
    ],

    parseImports(content: string, _filePath: string): ImportMatch[] {
        const imports: ImportMatch[] = [];
        const seen = new Set<string>();

        const addImport = (importPath: string, type: ImportMatch['importType']) => {
            if (!seen.has(importPath)) {
                seen.add(importPath);
                imports.push({ importPath, importType: type });
            }
        };

        // Reset regex lastIndex
        ES_IMPORT_FROM_REGEX.lastIndex = 0;
        DYNAMIC_IMPORT_REGEX.lastIndex = 0;
        REQUIRE_REGEX.lastIndex = 0;
        SIDE_EFFECT_IMPORT_REGEX.lastIndex = 0;

        let match;

        // ES imports (import x from 'y', export { x } from 'y')
        while ((match = ES_IMPORT_FROM_REGEX.exec(content)) !== null) {
            addImport(match[1], 'static');
        }

        // Dynamic imports
        while ((match = DYNAMIC_IMPORT_REGEX.exec(content)) !== null) {
            addImport(match[1], 'dynamic');
        }

        // CommonJS require
        while ((match = REQUIRE_REGEX.exec(content)) !== null) {
            addImport(match[1], 'require');
        }

        // Side-effect imports (import 'styles.css')
        while ((match = SIDE_EFFECT_IMPORT_REGEX.exec(content)) !== null) {
            // Avoid duplicates with ES_IMPORT_FROM_REGEX
            if (!seen.has(match[1])) {
                addImport(match[1], 'side-effect');
            }
        }

        return imports;
    },

    async resolveImport(
        importPath: string,
        fromFile: string,
        projectRoot: string
    ): Promise<string | null> {
        // Skip external packages (no leading . or /)
        const isRelative = importPath.startsWith('.');
        const isAbsolute = importPath.startsWith('/');
        const isAliased = ALIAS_PREFIXES.some(prefix => importPath.startsWith(prefix));

        if (!isRelative && !isAbsolute && !isAliased) {
            // Bare specifier - could be a package or a baseUrl import
            // Try resolving from project root first
            const rootAttempt = path.join(projectRoot, importPath);
            const resolvedRoot = await resolvePathOnDisk(rootAttempt);
            if (resolvedRoot) return resolvedRoot;

            // Try from src folder
            const srcAttempt = path.join(projectRoot, 'src', importPath);
            const resolvedSrc = await resolvePathOnDisk(srcAttempt);
            if (resolvedSrc) return resolvedSrc;

            // External package - return null
            return null;
        }

        let potentialPath: string;

        if (isRelative) {
            // Relative import
            potentialPath = path.resolve(path.dirname(fromFile), importPath);
        } else if (isAbsolute) {
            // Absolute path (rare)
            potentialPath = importPath;
        } else {
            // Aliased import (@/, ~/, #/)
            const prefix = ALIAS_PREFIXES.find(p => importPath.startsWith(p))!;
            const subPath = importPath.substring(prefix.length);

            // Try project root
            potentialPath = path.join(projectRoot, subPath);
            const resolved = await resolvePathOnDisk(potentialPath);
            if (resolved) return resolved;

            // Try src folder
            potentialPath = path.join(projectRoot, 'src', subPath);
        }

        return resolvePathOnDisk(potentialPath);
    }
};

/**
 * Clear the resolution cache (useful for testing or hot reload)
 */
export function clearResolutionCache(): void {
    existenceCache.clear();
}
