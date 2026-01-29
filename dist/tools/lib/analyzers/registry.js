"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzerRegistry = void 0;
/**
 * Analyzer Registry - Manages language analyzer plugins
 */
const path_1 = __importDefault(require("path"));
class AnalyzerRegistry {
    analyzers = new Map();
    analyzersByName = new Map();
    /**
     * Register a language analyzer
     */
    register(analyzer) {
        this.analyzersByName.set(analyzer.name, analyzer);
        for (const ext of analyzer.extensions) {
            this.analyzers.set(ext.toLowerCase(), analyzer);
        }
    }
    /**
     * Get analyzer for a specific file based on extension
     */
    getForFile(filePath) {
        const ext = path_1.default.extname(filePath).slice(1).toLowerCase();
        return this.analyzers.get(ext) || null;
    }
    /**
     * Get analyzer by name
     */
    getByName(name) {
        return this.analyzersByName.get(name) || null;
    }
    /**
     * Get all registered extensions
     */
    getSupportedExtensions() {
        return Array.from(this.analyzers.keys());
    }
    /**
     * Get all registered analyzer names
     */
    getRegisteredAnalyzers() {
        return Array.from(this.analyzersByName.keys());
    }
    /**
     * Check if a file is supported by any analyzer
     */
    isSupported(filePath) {
        return this.getForFile(filePath) !== null;
    }
}
// Singleton instance
exports.analyzerRegistry = new AnalyzerRegistry();
