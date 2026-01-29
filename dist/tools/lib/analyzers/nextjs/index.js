"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextjsAnalyzer = void 0;
exports.clearResolutionCache = clearResolutionCache;
/**
 * Next.js / JavaScript / TypeScript Analyzer
 * Handles import parsing and resolution for JS/TS ecosystem
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const patterns_1 = require("./patterns");
/**
 * Cache for file existence checks
 */
const existenceCache = new Map();
/**
 * Resolve a path on disk, trying extensions and index files
 */
async function resolvePathOnDisk(absPath) {
    if (existenceCache.has(absPath)) {
        return existenceCache.get(absPath);
    }
    // Check exact path
    try {
        const stats = await promises_1.default.stat(absPath);
        if (stats.isFile()) {
            existenceCache.set(absPath, absPath);
            return absPath;
        }
    }
    catch { }
    // Try with extensions
    for (const ext of patterns_1.RESOLVABLE_EXTENSIONS) {
        const p = `${absPath}.${ext}`;
        try {
            if ((await promises_1.default.stat(p)).isFile()) {
                existenceCache.set(absPath, p);
                return p;
            }
        }
        catch { }
    }
    // Try index files
    for (const indexFile of patterns_1.INDEX_FILES) {
        const p = path_1.default.join(absPath, indexFile);
        try {
            if ((await promises_1.default.stat(p)).isFile()) {
                existenceCache.set(absPath, p);
                return p;
            }
        }
        catch { }
    }
    existenceCache.set(absPath, null);
    return null;
}
/**
 * Next.js/TypeScript/JavaScript Analyzer
 */
exports.nextjsAnalyzer = {
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
    parseImports(content, _filePath) {
        const imports = [];
        const seen = new Set();
        const addImport = (importPath, type) => {
            if (!seen.has(importPath)) {
                seen.add(importPath);
                imports.push({ importPath, importType: type });
            }
        };
        // Reset regex lastIndex
        patterns_1.ES_IMPORT_FROM_REGEX.lastIndex = 0;
        patterns_1.DYNAMIC_IMPORT_REGEX.lastIndex = 0;
        patterns_1.REQUIRE_REGEX.lastIndex = 0;
        patterns_1.SIDE_EFFECT_IMPORT_REGEX.lastIndex = 0;
        let match;
        // ES imports (import x from 'y', export { x } from 'y')
        while ((match = patterns_1.ES_IMPORT_FROM_REGEX.exec(content)) !== null) {
            addImport(match[1], 'static');
        }
        // Dynamic imports
        while ((match = patterns_1.DYNAMIC_IMPORT_REGEX.exec(content)) !== null) {
            addImport(match[1], 'dynamic');
        }
        // CommonJS require
        while ((match = patterns_1.REQUIRE_REGEX.exec(content)) !== null) {
            addImport(match[1], 'require');
        }
        // Side-effect imports (import 'styles.css')
        while ((match = patterns_1.SIDE_EFFECT_IMPORT_REGEX.exec(content)) !== null) {
            // Avoid duplicates with ES_IMPORT_FROM_REGEX
            if (!seen.has(match[1])) {
                addImport(match[1], 'side-effect');
            }
        }
        return imports;
    },
    async resolveImport(importPath, fromFile, projectRoot) {
        // Skip external packages (no leading . or /)
        const isRelative = importPath.startsWith('.');
        const isAbsolute = importPath.startsWith('/');
        const isAliased = patterns_1.ALIAS_PREFIXES.some(prefix => importPath.startsWith(prefix));
        if (!isRelative && !isAbsolute && !isAliased) {
            // Bare specifier - could be a package or a baseUrl import
            // Try resolving from project root first
            const rootAttempt = path_1.default.join(projectRoot, importPath);
            const resolvedRoot = await resolvePathOnDisk(rootAttempt);
            if (resolvedRoot)
                return resolvedRoot;
            // Try from src folder
            const srcAttempt = path_1.default.join(projectRoot, 'src', importPath);
            const resolvedSrc = await resolvePathOnDisk(srcAttempt);
            if (resolvedSrc)
                return resolvedSrc;
            // External package - return null
            return null;
        }
        let potentialPath;
        if (isRelative) {
            // Relative import
            potentialPath = path_1.default.resolve(path_1.default.dirname(fromFile), importPath);
        }
        else if (isAbsolute) {
            // Absolute path (rare)
            potentialPath = importPath;
        }
        else {
            // Aliased import (@/, ~/, #/)
            const prefix = patterns_1.ALIAS_PREFIXES.find(p => importPath.startsWith(p));
            const subPath = importPath.substring(prefix.length);
            // Try project root
            potentialPath = path_1.default.join(projectRoot, subPath);
            const resolved = await resolvePathOnDisk(potentialPath);
            if (resolved)
                return resolved;
            // Try src folder
            potentialPath = path_1.default.join(projectRoot, 'src', subPath);
        }
        return resolvePathOnDisk(potentialPath);
    }
};
/**
 * Clear the resolution cache (useful for testing or hot reload)
 */
function clearResolutionCache() {
    existenceCache.clear();
}
