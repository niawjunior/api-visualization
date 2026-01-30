"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextjsAnalyzer = void 0;
exports.clearResolutionCache = clearResolutionCache;
/**
 * Next.js/TypeScript Dependency Analyzer
 * Implements LanguageAnalyzer for JavaScript/TypeScript projects.
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const patterns_1 = require("./patterns");
// ============================================================================
// Resolution Cache
// ============================================================================
const resolutionCache = new Map();
/**
 * Clear the import resolution cache.
 */
function clearResolutionCache() {
    resolutionCache.clear();
}
// ============================================================================
// Next.js Analyzer Implementation
// ============================================================================
exports.nextjsAnalyzer = {
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
    parseImports(content, filePath) {
        const imports = [];
        // ES imports and re-exports
        let match;
        const esRegex = new RegExp(patterns_1.ES_IMPORT_FROM_REGEX.source, 'g');
        while ((match = esRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'static',
                });
            }
        }
        // Dynamic imports
        const dynamicRegex = new RegExp(patterns_1.DYNAMIC_IMPORT_REGEX.source, 'g');
        while ((match = dynamicRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'dynamic',
                });
            }
        }
        // Require statements
        const requireRegex = new RegExp(patterns_1.REQUIRE_REGEX.source, 'g');
        while ((match = requireRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({
                    importPath: match[1],
                    importType: 'require',
                });
            }
        }
        // Side-effect imports
        const sideEffectRegex = new RegExp(patterns_1.SIDE_EFFECT_IMPORT_REGEX.source, 'g');
        while ((match = sideEffectRegex.exec(content)) !== null) {
            if (match[1]) {
                // Avoid duplicates from ES import regex
                if (!imports.some(i => i.importPath === match[1])) {
                    imports.push({
                        importPath: match[1],
                        importType: 'side-effect',
                    });
                }
            }
        }
        return imports;
    },
    async resolveImport(importPath, fromFile, projectRoot) {
        // Check cache
        const cacheKey = `${fromFile}:${importPath}`;
        if (resolutionCache.has(cacheKey)) {
            return resolutionCache.get(cacheKey);
        }
        const result = await doResolveImport(importPath, fromFile, projectRoot);
        resolutionCache.set(cacheKey, result);
        return result;
    },
};
// ============================================================================
// Import Resolution Logic
// ============================================================================
async function doResolveImport(importPath, fromFile, projectRoot) {
    // Skip external packages
    if (isExternalPackage(importPath)) {
        return null;
    }
    // Handle relative imports
    if (importPath.startsWith('.')) {
        const dir = path_1.default.dirname(fromFile);
        const resolved = path_1.default.resolve(dir, importPath);
        return await tryResolve(resolved);
    }
    // Handle alias imports (@/, ~/, #/)
    for (const prefix of patterns_1.ALIAS_PREFIXES) {
        if (importPath.startsWith(prefix)) {
            const aliasPath = importPath.slice(prefix.length);
            const resolved = path_1.default.join(projectRoot, aliasPath);
            return await tryResolve(resolved);
        }
    }
    // Unresolved - likely external
    return null;
}
function isExternalPackage(importPath) {
    // External if not relative and doesn't start with an alias
    if (importPath.startsWith('.'))
        return false;
    for (const prefix of patterns_1.ALIAS_PREFIXES) {
        if (importPath.startsWith(prefix))
            return false;
    }
    return true;
}
async function tryResolve(basePath) {
    // Try exact path
    if (await fileExists(basePath)) {
        return basePath;
    }
    // Try with extensions
    for (const ext of patterns_1.RESOLVABLE_EXTENSIONS) {
        const withExt = `${basePath}.${ext}`;
        if (await fileExists(withExt)) {
            return withExt;
        }
    }
    // Try as directory with index file
    for (const indexFile of patterns_1.INDEX_FILES) {
        const indexPath = path_1.default.join(basePath, indexFile);
        if (await fileExists(indexPath)) {
            return indexPath;
        }
    }
    return null;
}
async function fileExists(filePath) {
    try {
        const stat = await promises_1.default.stat(filePath);
        return stat.isFile();
    }
    catch {
        return false;
    }
}
