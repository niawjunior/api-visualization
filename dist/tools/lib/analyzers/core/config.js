"use strict";
/**
 * Configuration file support for API visualization
 * Loads and parses .api-viz.config.js or .api-viz.json
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.loadConfig = loadConfig;
exports.matchesPattern = matchesPattern;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const result_1 = require("./result");
// ============================================================================
// Default config
// ============================================================================
exports.DEFAULT_CONFIG = {
    include: ['app/api/**/*.ts', 'pages/api/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**', '**/node_modules/**'],
    patterns: {
        database: ['drizzle-orm', 'prisma', '@prisma/client', 'mongoose', 'typeorm', '@/db/*'],
        services: ['@/services/*', '@/lib/*'],
        utilities: ['@/utils/*', '@/helpers/*'],
        external: ['axios', 'node-fetch', 'ky', 'got'],
    },
    database: {
        clientNames: ['db', 'prisma', 'client', 'mongoose'],
        tableSuffixes: ['Table', 'Schema', 'Model'],
    },
    analysis: {
        cache: true,
        cacheTtl: 5 * 60 * 1000,
        maxTypeDepth: 5,
    },
};
// ============================================================================
// Config file names to search for
// ============================================================================
const CONFIG_FILES = [
    '.api-viz.config.js',
    '.api-viz.config.mjs',
    '.api-viz.config.json',
    'api-viz.config.js',
    'api-viz.config.json',
];
// ============================================================================
// Config loader
// ============================================================================
/**
 * Load config from project directory
 * Searches for config files and merges with defaults
 */
function loadConfig(projectPath) {
    // Search for config file
    for (const fileName of CONFIG_FILES) {
        const configPath = path.join(projectPath, fileName);
        if (fs.existsSync(configPath)) {
            const result = parseConfigFile(configPath);
            if (result.ok) {
                return (0, result_1.ok)(mergeConfig(result.value));
            }
            // Continue searching if parse failed
        }
    }
    // No config file found, use defaults
    return (0, result_1.ok)(exports.DEFAULT_CONFIG);
}
/**
 * Parse a config file
 */
function parseConfigFile(configPath) {
    try {
        const ext = path.extname(configPath);
        if (ext === '.json') {
            const content = fs.readFileSync(configPath, 'utf-8');
            return (0, result_1.ok)(JSON.parse(content));
        }
        if (ext === '.js' || ext === '.mjs') {
            // Clear require cache to get fresh config
            delete require.cache[require.resolve(configPath)];
            const config = require(configPath);
            return (0, result_1.ok)(config.default || config);
        }
        return (0, result_1.err)((0, result_1.analysisError)(result_1.AnalysisErrorCode.INVALID_CONFIG, `Unsupported config file extension: ${ext}`, { filePath: configPath }));
    }
    catch (e) {
        return (0, result_1.err)((0, result_1.analysisError)(result_1.AnalysisErrorCode.INVALID_CONFIG, `Failed to parse config: ${e instanceof Error ? e.message : 'Unknown error'}`, { filePath: configPath, details: e }));
    }
}
/**
 * Merge user config with defaults
 */
function mergeConfig(userConfig) {
    return {
        include: userConfig.include ?? exports.DEFAULT_CONFIG.include,
        exclude: userConfig.exclude ?? exports.DEFAULT_CONFIG.exclude,
        patterns: {
            database: userConfig.patterns?.database ?? exports.DEFAULT_CONFIG.patterns.database,
            services: userConfig.patterns?.services ?? exports.DEFAULT_CONFIG.patterns.services,
            utilities: userConfig.patterns?.utilities ?? exports.DEFAULT_CONFIG.patterns.utilities,
            external: userConfig.patterns?.external ?? exports.DEFAULT_CONFIG.patterns.external,
        },
        database: {
            clientNames: userConfig.database?.clientNames ?? exports.DEFAULT_CONFIG.database.clientNames,
            tableSuffixes: userConfig.database?.tableSuffixes ?? exports.DEFAULT_CONFIG.database.tableSuffixes,
        },
        analysis: {
            cache: userConfig.analysis?.cache ?? exports.DEFAULT_CONFIG.analysis.cache,
            cacheTtl: userConfig.analysis?.cacheTtl ?? exports.DEFAULT_CONFIG.analysis.cacheTtl,
            maxTypeDepth: userConfig.analysis?.maxTypeDepth ?? exports.DEFAULT_CONFIG.analysis.maxTypeDepth,
        },
    };
}
/**
 * Check if a module matches any pattern in the list
 */
function matchesPattern(module, patterns) {
    for (const pattern of patterns) {
        // Exact match
        if (pattern === module)
            return true;
        // Glob-like matching
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2);
            if (module.startsWith(prefix))
                return true;
        }
        // Package match (e.g., 'drizzle-orm' matches 'drizzle-orm/pg-core')
        if (module.startsWith(pattern + '/'))
            return true;
    }
    return false;
}
