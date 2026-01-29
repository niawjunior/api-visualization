"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDependencies = analyzeDependencies;
exports.analyze = analyze;
/**
 * Core Dependency Analyzer
 * Language-agnostic orchestration of dependency analysis
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const registry_1 = require("./registry");
// Import and register analyzers
const nextjs_1 = require("./nextjs");
registry_1.analyzerRegistry.register(nextjs_1.nextjsAnalyzer);
/**
 * Find the project root by looking for package.json
 */
async function findProjectRoot(startPath) {
    let current = startPath;
    while (current !== path_1.default.parse(current).root) {
        try {
            await promises_1.default.access(path_1.default.join(current, 'package.json'));
            return current;
        }
        catch {
            current = path_1.default.dirname(current);
        }
    }
    return startPath;
}
/**
 * Analyze dependencies in a directory
 */
async function analyzeDependencies(options) {
    const { scanPath } = options;
    const projectRoot = options.projectRoot || await findProjectRoot(scanPath);
    const nodes = [];
    const edges = [];
    const addedNodes = new Set();
    // Get supported extensions from registry
    const extensions = registry_1.analyzerRegistry.getSupportedExtensions();
    if (extensions.length === 0) {
        return { nodes, edges };
    }
    // Get ignore patterns from all analyzers
    const ignorePatterns = new Set();
    for (const name of registry_1.analyzerRegistry.getRegisteredAnalyzers()) {
        const analyzer = registry_1.analyzerRegistry.getByName(name);
        if (analyzer) {
            analyzer.ignorePatterns.forEach(p => ignorePatterns.add(p));
        }
    }
    // Scan for files
    const files = await (0, glob_1.glob)(`**/*.{${extensions.join(',')}}`, {
        cwd: scanPath,
        dot: false,
        ignore: Array.from(ignorePatterns),
        absolute: true
    });
    const scannedPaths = new Set(files.map(f => path_1.default.normalize(f)));
    // Helper to add a node
    const addNode = (absPath, isExternal = false) => {
        const norm = path_1.default.normalize(absPath);
        if (addedNodes.has(norm))
            return;
        addedNodes.add(norm);
        nodes.push({
            id: norm,
            label: path_1.default.basename(norm),
            type: isExternal ? 'external' : 'file',
            isExternal
        });
    };
    // Add all scanned files as nodes
    files.forEach(f => addNode(f, false));
    // Process each file
    for (const filePath of files) {
        const normalizedSource = path_1.default.normalize(filePath);
        // Get analyzer for this file
        const analyzer = registry_1.analyzerRegistry.getForFile(filePath);
        if (!analyzer)
            continue;
        try {
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            const imports = analyzer.parseImports(content, filePath);
            for (const imp of imports) {
                const resolved = await analyzer.resolveImport(imp.importPath, filePath, projectRoot);
                if (resolved) {
                    const normTarget = path_1.default.normalize(resolved);
                    // Prevent self-loops
                    if (normTarget === normalizedSource)
                        continue;
                    // Add external node if not in scanned files
                    if (!scannedPaths.has(normTarget)) {
                        addNode(normTarget, true);
                    }
                    edges.push({
                        source: normalizedSource,
                        target: normTarget
                    });
                }
            }
        }
        catch (err) {
            // Skip files that can't be read
        }
    }
    return { nodes, edges };
}
/**
 * Convenience function with simpler signature for backwards compatibility
 */
async function analyze(scanPath) {
    return analyzeDependencies({ scanPath });
}
