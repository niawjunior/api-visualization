"use strict";
/**
 * API Analyzer Registry
 * Manages available framework analyzers and selects the appropriate one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiAnalyzerRegistry = void 0;
class AnalyzerRegistry {
    analyzers = new Map();
    /**
     * Register a new analyzer
     */
    register(analyzer) {
        if (this.analyzers.has(analyzer.name)) {
            console.warn(`Analyzer ${analyzer.name} is already registered. Overwriting.`);
        }
        this.analyzers.set(analyzer.name, analyzer);
    }
    /**
     * Get a specific analyzer by name
     */
    get(name) {
        return this.analyzers.get(name);
    }
    /**
     * Get all registered analyzers
     */
    getAll() {
        return Array.from(this.analyzers.values());
    }
    /**
     * Detect the appropriate analyzer for a project
     */
    async detect(projectPath, config) {
        // Check all analyzers
        for (const analyzer of this.analyzers.values()) {
            try {
                if (await analyzer.detect(projectPath, config)) {
                    return analyzer;
                }
            }
            catch (error) {
                console.error(`Error in analyzer ${analyzer.name} detect():`, error);
            }
        }
        return null;
    }
}
exports.apiAnalyzerRegistry = new AnalyzerRegistry();
