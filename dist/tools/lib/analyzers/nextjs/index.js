"use strict";
/**
 * Next.js Route Analyzer
 *
 * A modular, AST-based API route analyzer for Next.js projects.
 *
 * @module analyzers/nextjs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMethodLineNumber = exports.extractRouteParams = exports.filePathToRoutePath = exports.resolveExpressionType = exports.collectVariables = exports.extractPropertiesFromObjectLiteral = exports.extractPropertiesFromType = exports.typeToString = exports.clearRequestPatterns = exports.registerRequestPattern = exports.IGNORED_DIRS = exports.ROUTE_FILE_PATTERNS = exports.HTTP_METHODS = exports.clearProgramCache = exports.analyzeApiEndpoints = exports.analyzeRouteFile = exports.clearResolutionCache = exports.nextjsAnalyzer = void 0;
// Dependency Analyzer (for backward compatibility with analyzer registry)
var dependency_analyzer_1 = require("./dependency-analyzer");
Object.defineProperty(exports, "nextjsAnalyzer", { enumerable: true, get: function () { return dependency_analyzer_1.nextjsAnalyzer; } });
Object.defineProperty(exports, "clearResolutionCache", { enumerable: true, get: function () { return dependency_analyzer_1.clearResolutionCache; } });
// Main analysis functions
var analyzer_1 = require("./analyzer");
Object.defineProperty(exports, "analyzeRouteFile", { enumerable: true, get: function () { return analyzer_1.analyzeRouteFile; } });
Object.defineProperty(exports, "analyzeApiEndpoints", { enumerable: true, get: function () { return analyzer_1.analyzeApiEndpoints; } });
Object.defineProperty(exports, "clearProgramCache", { enumerable: true, get: function () { return analyzer_1.clearProgramCache; } });
// Constants
var types_1 = require("./types");
Object.defineProperty(exports, "HTTP_METHODS", { enumerable: true, get: function () { return types_1.HTTP_METHODS; } });
Object.defineProperty(exports, "ROUTE_FILE_PATTERNS", { enumerable: true, get: function () { return types_1.ROUTE_FILE_PATTERNS; } });
Object.defineProperty(exports, "IGNORED_DIRS", { enumerable: true, get: function () { return types_1.IGNORED_DIRS; } });
// Pattern registration (for extensibility)
var request_1 = require("./extractors/request");
Object.defineProperty(exports, "registerRequestPattern", { enumerable: true, get: function () { return request_1.registerRequestPattern; } });
Object.defineProperty(exports, "clearRequestPatterns", { enumerable: true, get: function () { return request_1.clearRequestPatterns; } });
// Utilities (for custom patterns)
var type_utils_1 = require("./utils/type-utils");
Object.defineProperty(exports, "typeToString", { enumerable: true, get: function () { return type_utils_1.typeToString; } });
Object.defineProperty(exports, "extractPropertiesFromType", { enumerable: true, get: function () { return type_utils_1.extractPropertiesFromType; } });
Object.defineProperty(exports, "extractPropertiesFromObjectLiteral", { enumerable: true, get: function () { return type_utils_1.extractPropertiesFromObjectLiteral; } });
Object.defineProperty(exports, "collectVariables", { enumerable: true, get: function () { return type_utils_1.collectVariables; } });
Object.defineProperty(exports, "resolveExpressionType", { enumerable: true, get: function () { return type_utils_1.resolveExpressionType; } });
var path_utils_1 = require("./utils/path-utils");
Object.defineProperty(exports, "filePathToRoutePath", { enumerable: true, get: function () { return path_utils_1.filePathToRoutePath; } });
Object.defineProperty(exports, "extractRouteParams", { enumerable: true, get: function () { return path_utils_1.extractRouteParams; } });
Object.defineProperty(exports, "findMethodLineNumber", { enumerable: true, get: function () { return path_utils_1.findMethodLineNumber; } });
