"use strict";
/**
 * Analyzers Module - Entry point
 * Exports the public API for dependency analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearProgramCache = exports.analyzeApiEndpoints = exports.analyzeRouteFile = exports.clearResolutionCache = exports.nextjsAnalyzer = exports.analyze = exports.analyzeDependencies = exports.analyzerRegistry = void 0;
// Registry
var registry_1 = require("./registry");
Object.defineProperty(exports, "analyzerRegistry", { enumerable: true, get: function () { return registry_1.analyzerRegistry; } });
// Core analyzer
var core_1 = require("./core");
Object.defineProperty(exports, "analyzeDependencies", { enumerable: true, get: function () { return core_1.analyzeDependencies; } });
Object.defineProperty(exports, "analyze", { enumerable: true, get: function () { return core_1.analyze; } });
// Individual analyzers (for direct use if needed)
var nextjs_1 = require("./nextjs");
Object.defineProperty(exports, "nextjsAnalyzer", { enumerable: true, get: function () { return nextjs_1.nextjsAnalyzer; } });
Object.defineProperty(exports, "clearResolutionCache", { enumerable: true, get: function () { return nextjs_1.clearResolutionCache; } });
// Route analyzer
var nextjs_2 = require("./nextjs");
Object.defineProperty(exports, "analyzeRouteFile", { enumerable: true, get: function () { return nextjs_2.analyzeRouteFile; } });
Object.defineProperty(exports, "analyzeApiEndpoints", { enumerable: true, get: function () { return nextjs_2.analyzeApiEndpoints; } });
Object.defineProperty(exports, "clearProgramCache", { enumerable: true, get: function () { return nextjs_2.clearProgramCache; } });
