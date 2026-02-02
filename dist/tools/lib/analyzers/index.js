"use strict";
/**
 * Analyzers Module - Entry point
 * Exports the public API for dependency analysis and API endpoint analysis.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearProgramCache = exports.analyzeApiEndpoints = exports.analyzeRouteFile = exports.clearResolutionCache = exports.nextjsAnalyzer = exports.analyze = exports.analyzeDependencies = exports.analyzerRegistry = exports.apiAnalyzerRegistry = void 0;
exports.analyzeProject = analyzeProject;
const registry_1 = require("./core/registry");
const nextjs_1 = require("./nextjs");
const config_1 = require("./core/config");
// Register built-in analyzers
registry_1.apiAnalyzerRegistry.register(nextjs_1.nextJsFrameworkAnalyzer);
// Core types & exports
__exportStar(require("./core/api-types"), exports);
__exportStar(require("./core/analyzer"), exports);
__exportStar(require("./core/config"), exports);
var registry_2 = require("./core/registry");
Object.defineProperty(exports, "apiAnalyzerRegistry", { enumerable: true, get: function () { return registry_2.apiAnalyzerRegistry; } });
// Registry (Dependency Graph)
var registry_3 = require("./registry");
Object.defineProperty(exports, "analyzerRegistry", { enumerable: true, get: function () { return registry_3.analyzerRegistry; } });
var core_1 = require("./core");
Object.defineProperty(exports, "analyzeDependencies", { enumerable: true, get: function () { return core_1.analyzeDependencies; } });
Object.defineProperty(exports, "analyze", { enumerable: true, get: function () { return core_1.analyze; } });
// Individual analyzers (for direct use if needed)
var nextjs_2 = require("./nextjs");
Object.defineProperty(exports, "nextjsAnalyzer", { enumerable: true, get: function () { return nextjs_2.nextjsAnalyzer; } });
Object.defineProperty(exports, "clearResolutionCache", { enumerable: true, get: function () { return nextjs_2.clearResolutionCache; } });
// Route analyzer implementation (Direct access)
var nextjs_3 = require("./nextjs");
Object.defineProperty(exports, "analyzeRouteFile", { enumerable: true, get: function () { return nextjs_3.analyzeRouteFile; } });
Object.defineProperty(exports, "analyzeApiEndpoints", { enumerable: true, get: function () { return nextjs_3.analyzeApiEndpoints; } });
Object.defineProperty(exports, "clearProgramCache", { enumerable: true, get: function () { return nextjs_3.clearProgramCache; } });
/**
 * Universal Project Analyzer
 * Auto-detects the framework and runs the appropriate analyzer.
 */
async function analyzeProject(projectPath) {
    const configResult = (0, config_1.loadConfig)(projectPath);
    const config = configResult.ok ? configResult.value : config_1.DEFAULT_CONFIG;
    // Auto-detect analyzer via Registry
    const analyzer = await registry_1.apiAnalyzerRegistry.detect(projectPath, config);
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
