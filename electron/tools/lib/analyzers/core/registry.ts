/**
 * API Analyzer Registry
 * Manages available framework analyzers and selects the appropriate one.
 */

import { ApiAnalyzer } from './analyzer';
import { ApiVizConfig } from './config';

class AnalyzerRegistry {
    private analyzers: Map<string, ApiAnalyzer> = new Map();
    
    /**
     * Register a new analyzer
     */
    register(analyzer: ApiAnalyzer) {
        if (this.analyzers.has(analyzer.name)) {
            console.warn(`Analyzer ${analyzer.name} is already registered. Overwriting.`);
        }
        this.analyzers.set(analyzer.name, analyzer);
    }
    
    /**
     * Get a specific analyzer by name
     */
    get(name: string): ApiAnalyzer | undefined {
        return this.analyzers.get(name);
    }
    
    /**
     * Get all registered analyzers
     */
    getAll(): ApiAnalyzer[] {
        return Array.from(this.analyzers.values());
    }
    
    /**
     * Detect the appropriate analyzer for a project
     */
    async detect(projectPath: string, config: ApiVizConfig): Promise<ApiAnalyzer | null> {
        // Check all analyzers
        for (const analyzer of this.analyzers.values()) {
            try {
                if (await analyzer.detect(projectPath, config)) {
                    return analyzer;
                }
            } catch (error) {
                console.error(`Error in analyzer ${analyzer.name} detect():`, error);
            }
        }
        
        return null;
    }
}

export const apiAnalyzerRegistry = new AnalyzerRegistry();
