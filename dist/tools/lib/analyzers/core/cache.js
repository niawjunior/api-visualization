"use strict";
/**
 * Caching layer for AST analysis
 * Caches analysis results by file path and modification time
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
exports.sourceFileCache = exports.routeCache = exports.dependencyCache = exports.AnalysisCache = void 0;
exports.clearAllCaches = clearAllCaches;
exports.getAllCacheStats = getAllCacheStats;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * In-memory cache for analysis results
 * Invalidates automatically when file is modified
 */
class AnalysisCache {
    cache = new Map();
    stats = { hits: 0, misses: 0, size: 0 };
    maxSize;
    ttlMs;
    constructor(options) {
        this.maxSize = options?.maxSize ?? 1000;
        this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
    }
    /**
     * Get cached data if valid (file unchanged and TTL not expired)
     */
    get(filePath) {
        const entry = this.cache.get(filePath);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        // Check TTL
        if (Date.now() - entry.createdAt > this.ttlMs) {
            this.cache.delete(filePath);
            this.stats.misses++;
            return null;
        }
        // Check if file was modified
        try {
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs !== entry.mtime) {
                this.cache.delete(filePath);
                this.stats.misses++;
                return null;
            }
        }
        catch {
            // File doesn't exist, invalidate cache
            this.cache.delete(filePath);
            this.stats.misses++;
            return null;
        }
        this.stats.hits++;
        return entry.data;
    }
    /**
     * Cache analysis result for a file
     */
    set(filePath, data) {
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        try {
            const stat = fs.statSync(filePath);
            this.cache.set(filePath, {
                mtime: stat.mtimeMs,
                data,
                createdAt: Date.now(),
            });
            this.stats.size = this.cache.size;
        }
        catch {
            // Can't stat file, don't cache
        }
    }
    /**
     * Invalidate cache for a specific file
     */
    invalidate(filePath) {
        this.cache.delete(filePath);
        this.stats.size = this.cache.size;
    }
    /**
     * Invalidate all entries matching a pattern
     */
    invalidatePattern(pattern) {
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
            }
        }
        this.stats.size = this.cache.size;
    }
    /**
     * Invalidate all entries in a directory
     */
    invalidateDirectory(dirPath) {
        const normalizedDir = path.normalize(dirPath);
        for (const key of this.cache.keys()) {
            if (path.normalize(key).startsWith(normalizedDir)) {
                this.cache.delete(key);
            }
        }
        this.stats.size = this.cache.size;
    }
    /**
     * Clear all cached entries
     */
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, size: 0 };
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }
    /**
     * Evict oldest entries to make room
     */
    evictOldest() {
        // Simple FIFO eviction - remove first 10% of entries
        const toRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
        const keys = Array.from(this.cache.keys()).slice(0, toRemove);
        for (const key of keys) {
            this.cache.delete(key);
        }
    }
}
exports.AnalysisCache = AnalysisCache;
// ============================================================================
// Singleton caches for different analysis types
// ============================================================================
/** Cache for dependency analysis results */
exports.dependencyCache = new AnalysisCache();
/** Cache for route analysis results */
exports.routeCache = new AnalysisCache();
/** Cache for TypeScript source file AST */
exports.sourceFileCache = new AnalysisCache();
/**
 * Clear all analysis caches
 */
function clearAllCaches() {
    exports.dependencyCache.clear();
    exports.routeCache.clear();
    exports.sourceFileCache.clear();
}
/**
 * Get combined cache statistics
 */
function getAllCacheStats() {
    return {
        dependency: exports.dependencyCache.getStats(),
        route: exports.routeCache.getStats(),
        sourceFile: exports.sourceFileCache.getStats(),
    };
}
