/**
 * Caching layer for AST analysis
 * Caches analysis results by file path and modification time
 */

import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry<T> {
    mtime: number;      // File modification time
    data: T;            // Cached analysis result
    createdAt: number;  // When cache was created
}

interface CacheStats {
    hits: number;
    misses: number;
    size: number;
}

/**
 * In-memory cache for analysis results
 * Invalidates automatically when file is modified
 */
export class AnalysisCache<T = unknown> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
    private maxSize: number;
    private ttlMs: number;
    
    constructor(options?: {
        maxSize?: number;    // Max entries (default: 1000)
        ttlMs?: number;      // Time-to-live in ms (default: 5 minutes)
    }) {
        this.maxSize = options?.maxSize ?? 1000;
        this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
    }
    
    /**
     * Get cached data if valid (file unchanged and TTL not expired)
     */
    get(filePath: string): T | null {
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
        } catch {
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
    set(filePath: string, data: T): void {
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
        } catch {
            // Can't stat file, don't cache
        }
    }
    
    /**
     * Invalidate cache for a specific file
     */
    invalidate(filePath: string): void {
        this.cache.delete(filePath);
        this.stats.size = this.cache.size;
    }
    
    /**
     * Invalidate all entries matching a pattern
     */
    invalidatePattern(pattern: RegExp): void {
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
    invalidateDirectory(dirPath: string): void {
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
    clear(): void {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, size: 0 };
    }
    
    /**
     * Get cache statistics
     */
    getStats(): CacheStats & { hitRate: number } {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? this.stats.hits / total : 0,
        };
    }
    
    /**
     * Evict oldest entries to make room
     */
    private evictOldest(): void {
        // Simple FIFO eviction - remove first 10% of entries
        const toRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
        const keys = Array.from(this.cache.keys()).slice(0, toRemove);
        for (const key of keys) {
            this.cache.delete(key);
        }
    }
}

// ============================================================================
// Singleton caches for different analysis types
// ============================================================================

/** Cache for dependency analysis results */
export const dependencyCache = new AnalysisCache<{
    services: any[];
    database: any[];
    external: any[];
    utilities: any[];
    grouped: any[];
    tables: string[];
    apiCalls: string[];
}>();

/** Cache for route analysis results */
export const routeCache = new AnalysisCache<{
    methods: string[];
    params: any[];
    queryParams: any[];
    requestBody: any[];
    responseBody: any[];
}>();

/** Cache for TypeScript source file AST */
export const sourceFileCache = new AnalysisCache<{
    parsed: boolean;
    lastModified: number;
}>();

/**
 * Clear all analysis caches
 */
export function clearAllCaches(): void {
    dependencyCache.clear();
    routeCache.clear();
    sourceFileCache.clear();
}

/**
 * Get combined cache statistics
 */
export function getAllCacheStats(): Record<string, ReturnType<AnalysisCache['getStats']>> {
    return {
        dependency: dependencyCache.getStats(),
        route: routeCache.getStats(),
        sourceFile: sourceFileCache.getStats(),
    };
}
