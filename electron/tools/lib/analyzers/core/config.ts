/**
 * Configuration file support for API visualization
 * Loads and parses .api-viz.config.js or .api-viz.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { Result, ok, err, analysisError, AnalysisErrorCode } from './result';

// ============================================================================
// Types
// ============================================================================

export interface ApiVizConfig {
    /**
     * Glob patterns for files to include in analysis
     * @default ['app/api/**\/*.ts', 'pages/api/**\/*.ts']
     */
    include?: string[];
    
    /**
     * Glob patterns for files to exclude
     * @default ['**\/*.test.ts', '**\/*.spec.ts', '**\/__tests__/**']
     */
    exclude?: string[];
    
    /**
     * Custom patterns for categorizing dependencies
     */
    patterns?: {
        /** Patterns for database dependencies (e.g., ['drizzle-orm', 'prisma', '@/db/*']) */
        database?: string[];
        /** Patterns for service dependencies (e.g., ['@/services/*', '@/lib/*']) */
        services?: string[];
        /** Patterns for utility dependencies (e.g., ['@/utils/*', 'lodash']) */
        utilities?: string[];
        /** Patterns for external API calls (e.g., ['axios', 'fetch']) */
        external?: string[];
    };
    
    /**
     * Database table detection patterns
     */
    database?: {
        /** Variable names that indicate database clients (e.g., ['db', 'prisma', 'client']) */
        clientNames?: string[];
        /** Table identifier suffixes (e.g., ['Table', 'Schema', 'Model']) */
        tableSuffixes?: string[];
    };
    
    /**
     * Analysis options
     */
    analysis?: {
        /** Enable caching (default: true) */
        cache?: boolean;
        /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
        cacheTtl?: number;
        /** Maximum depth for type resolution (default: 5) */
        maxTypeDepth?: number;
    };
}

// ============================================================================
// Default config
// ============================================================================

export const DEFAULT_CONFIG: Required<ApiVizConfig> = {
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
export function loadConfig(projectPath: string): Result<Required<ApiVizConfig>> {
    // Search for config file
    for (const fileName of CONFIG_FILES) {
        const configPath = path.join(projectPath, fileName);
        
        if (fs.existsSync(configPath)) {
            const result = parseConfigFile(configPath);
            if (result.ok) {
                return ok(mergeConfig(result.value));
            }
            // Continue searching if parse failed
        }
    }
    
    // No config file found, use defaults
    return ok(DEFAULT_CONFIG);
}

/**
 * Parse a config file
 */
function parseConfigFile(configPath: string): Result<ApiVizConfig> {
    try {
        const ext = path.extname(configPath);
        
        if (ext === '.json') {
            const content = fs.readFileSync(configPath, 'utf-8');
            return ok(JSON.parse(content));
        }
        
        if (ext === '.js' || ext === '.mjs') {
            // Clear require cache to get fresh config
            delete require.cache[require.resolve(configPath)];
            const config = require(configPath);
            return ok(config.default || config);
        }
        
        return err(analysisError(
            AnalysisErrorCode.INVALID_CONFIG,
            `Unsupported config file extension: ${ext}`,
            { filePath: configPath }
        ));
    } catch (e) {
        return err(analysisError(
            AnalysisErrorCode.INVALID_CONFIG,
            `Failed to parse config: ${e instanceof Error ? e.message : 'Unknown error'}`,
            { filePath: configPath, details: e }
        ));
    }
}

/**
 * Merge user config with defaults
 */
function mergeConfig(userConfig: ApiVizConfig): Required<ApiVizConfig> {
    return {
        include: userConfig.include ?? DEFAULT_CONFIG.include,
        exclude: userConfig.exclude ?? DEFAULT_CONFIG.exclude,
        patterns: {
            database: userConfig.patterns?.database ?? DEFAULT_CONFIG.patterns.database,
            services: userConfig.patterns?.services ?? DEFAULT_CONFIG.patterns.services,
            utilities: userConfig.patterns?.utilities ?? DEFAULT_CONFIG.patterns.utilities,
            external: userConfig.patterns?.external ?? DEFAULT_CONFIG.patterns.external,
        },
        database: {
            clientNames: userConfig.database?.clientNames ?? DEFAULT_CONFIG.database.clientNames,
            tableSuffixes: userConfig.database?.tableSuffixes ?? DEFAULT_CONFIG.database.tableSuffixes,
        },
        analysis: {
            cache: userConfig.analysis?.cache ?? DEFAULT_CONFIG.analysis.cache,
            cacheTtl: userConfig.analysis?.cacheTtl ?? DEFAULT_CONFIG.analysis.cacheTtl,
            maxTypeDepth: userConfig.analysis?.maxTypeDepth ?? DEFAULT_CONFIG.analysis.maxTypeDepth,
        },
    };
}

/**
 * Check if a module matches any pattern in the list
 */
export function matchesPattern(module: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        // Exact match
        if (pattern === module) return true;
        
        // Glob-like matching
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2);
            if (module.startsWith(prefix)) return true;
        }
        
        // Package match (e.g., 'drizzle-orm' matches 'drizzle-orm/pg-core')
        if (module.startsWith(pattern + '/')) return true;
    }
    
    return false;
}
