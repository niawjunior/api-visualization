/**
 * Analyzer Registry - Manages language analyzer plugins
 */
import path from 'path';
import { LanguageAnalyzer } from './types';

class AnalyzerRegistry {
    private analyzers = new Map<string, LanguageAnalyzer>();
    private analyzersByName = new Map<string, LanguageAnalyzer>();

    /**
     * Register a language analyzer
     */
    register(analyzer: LanguageAnalyzer): void {
        this.analyzersByName.set(analyzer.name, analyzer);
        for (const ext of analyzer.extensions) {
            this.analyzers.set(ext.toLowerCase(), analyzer);
        }
    }

    /**
     * Get analyzer for a specific file based on extension
     */
    getForFile(filePath: string): LanguageAnalyzer | null {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        return this.analyzers.get(ext) || null;
    }

    /**
     * Get analyzer by name
     */
    getByName(name: string): LanguageAnalyzer | null {
        return this.analyzersByName.get(name) || null;
    }

    /**
     * Get all registered extensions
     */
    getSupportedExtensions(): string[] {
        return Array.from(this.analyzers.keys());
    }

    /**
     * Get all registered analyzer names
     */
    getRegisteredAnalyzers(): string[] {
        return Array.from(this.analyzersByName.keys());
    }

    /**
     * Check if a file is supported by any analyzer
     */
    isSupported(filePath: string): boolean {
        return this.getForFile(filePath) !== null;
    }
}

// Singleton instance
export const analyzerRegistry = new AnalyzerRegistry();
