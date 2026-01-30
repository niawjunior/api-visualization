"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateProgram = getOrCreateProgram;
exports.clearProgramCache = clearProgramCache;
exports.getCachedProjectRoot = getCachedProjectRoot;
/**
 * TypeScript Program Management
 * Handles program creation, caching, and type checker access.
 */
const typescript_1 = __importDefault(require("typescript"));
// ============================================================================
// Program Cache
// ============================================================================
let cachedProgram = null;
let cachedProjectRoot = null;
let cachedFiles = null;
/**
 * Get or create a TypeScript program for analysis.
 * Caches the program to avoid re-parsing for subsequent analyses in the same project.
 */
function getOrCreateProgram(files, projectRoot) {
    // Check if we can reuse cached program
    if (cachedProgram && cachedProjectRoot === projectRoot && cachedFiles) {
        // Check if all requested files are in the cache
        const allCached = files.every(f => cachedFiles.has(f));
        if (allCached) {
            return cachedProgram;
        }
    }
    const configPath = typescript_1.default.findConfigFile(projectRoot, typescript_1.default.sys.fileExists, 'tsconfig.json');
    let compilerOptions = getDefaultCompilerOptions();
    if (configPath) {
        const configFile = typescript_1.default.readConfigFile(configPath, typescript_1.default.sys.readFile);
        if (configFile.config) {
            const parsed = typescript_1.default.parseJsonConfigFileContent(configFile.config, typescript_1.default.sys, projectRoot);
            compilerOptions = { ...compilerOptions, ...parsed.options };
        }
    }
    cachedProgram = typescript_1.default.createProgram(files, compilerOptions);
    cachedProjectRoot = projectRoot;
    cachedFiles = new Set(files);
    return cachedProgram;
}
/**
 * Clear the program cache. Call when switching projects or after significant changes.
 */
function clearProgramCache() {
    cachedProgram = null;
    cachedProjectRoot = null;
    cachedFiles = null;
}
/**
 * Get the cached project root, if any.
 */
function getCachedProjectRoot() {
    return cachedProjectRoot;
}
// ============================================================================
// Default Compiler Options
// ============================================================================
function getDefaultCompilerOptions() {
    return {
        target: typescript_1.default.ScriptTarget.ESNext,
        module: typescript_1.default.ModuleKind.ESNext,
        moduleResolution: typescript_1.default.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowJs: true,
        resolveJsonModule: true,
    };
}
