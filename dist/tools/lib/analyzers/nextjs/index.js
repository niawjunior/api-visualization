"use strict";
/**
 * Next.js Route Analyzer
 *
 * A modular, AST-based API route analyzer for Next.js projects.
 *
 * @module analyzers/nextjs
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextJsFrameworkAnalyzer = exports.findMethodLineNumber = exports.extractRouteParams = exports.filePathToRoutePath = exports.resolveExpressionType = exports.collectVariables = exports.extractPropertiesFromObjectLiteral = exports.extractPropertiesFromType = exports.typeToString = exports.clearRequestPatterns = exports.registerRequestPattern = exports.IGNORED_DIRS = exports.ROUTE_FILE_PATTERNS = exports.HTTP_METHODS = exports.clearProgramCache = exports.analyzeApiEndpoints = exports.analyzeRouteFile = exports.clearResolutionCache = exports.nextjsAnalyzer = void 0;
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
// Framework Analyzer Implementation
const analyzer_2 = require("./analyzer");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.nextJsFrameworkAnalyzer = {
    name: 'nextjs',
    detect: async (projectPath, config) => {
        // Simple detection: check for next.config.js or usage of next dependency
        // We can check package.json too, but file existence is fast
        const hasConfig = fs_1.default.existsSync(path_1.default.join(projectPath, 'next.config.js')) ||
            fs_1.default.existsSync(path_1.default.join(projectPath, 'next.config.mjs')) ||
            fs_1.default.existsSync(path_1.default.join(projectPath, 'next.config.ts'));
        if (hasConfig)
            return true;
        // Check package.json for next dependency
        const packageJsonPath = path_1.default.join(projectPath, 'package.json');
        if (fs_1.default.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf-8'));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (deps['next'])
                    return true;
            }
            catch (e) {
                // Ignore parse errors
            }
        }
        return false;
    },
    analyze: async (projectPath, config) => {
        return (0, analyzer_2.analyzeApiEndpoints)(projectPath, config);
    }
};
