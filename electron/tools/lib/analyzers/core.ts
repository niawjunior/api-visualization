/**
 * Core Dependency Analyzer
 * Language-agnostic orchestration of dependency analysis
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { analyzerRegistry } from './registry';
import { DependencyGraph, DependencyNode, DependencyEdge, AnalyzerOptions } from './types';

// Import and register analyzers
import { nextjsAnalyzer } from './nextjs';
analyzerRegistry.register(nextjsAnalyzer);

/**
 * Find the project root by looking for package.json
 */
async function findProjectRoot(startPath: string): Promise<string> {
    let current = startPath;
    while (current !== path.parse(current).root) {
        try {
            await fs.access(path.join(current, 'package.json'));
            return current;
        } catch {
            current = path.dirname(current);
        }
    }
    return startPath;
}

/**
 * Analyze dependencies in a directory
 */
export async function analyzeDependencies(options: AnalyzerOptions): Promise<DependencyGraph> {
    const { scanPath } = options;
    const projectRoot = options.projectRoot || await findProjectRoot(scanPath);

    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const addedNodes = new Set<string>();

    // Get supported extensions from registry
    const extensions = analyzerRegistry.getSupportedExtensions();
    if (extensions.length === 0) {
        return { nodes, edges };
    }

    // Get ignore patterns from all analyzers
    const ignorePatterns = new Set<string>();
    for (const name of analyzerRegistry.getRegisteredAnalyzers()) {
        const analyzer = analyzerRegistry.getByName(name);
        if (analyzer) {
            analyzer.ignorePatterns.forEach(p => ignorePatterns.add(p));
        }
    }

    // Scan for files
    const files = await glob(`**/*.{${extensions.join(',')}}`, {
        cwd: scanPath,
        dot: false,
        ignore: Array.from(ignorePatterns),
        absolute: true
    });

    const scannedPaths = new Set(files.map(f => path.normalize(f)));

    // Helper to add a node
    const addNode = (absPath: string, isExternal = false): void => {
        const norm = path.normalize(absPath);
        if (addedNodes.has(norm)) return;
        addedNodes.add(norm);

        nodes.push({
            id: norm,
            label: path.basename(norm),
            type: isExternal ? 'external' : 'file',
            isExternal
        });
    };

    // Add all scanned files as nodes
    files.forEach(f => addNode(f, false));

    // Process each file
    for (const filePath of files) {
        const normalizedSource = path.normalize(filePath);

        // Get analyzer for this file
        const analyzer = analyzerRegistry.getForFile(filePath);
        if (!analyzer) continue;

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const imports = analyzer.parseImports(content, filePath);

            for (const imp of imports) {
                const resolved = await analyzer.resolveImport(
                    imp.importPath,
                    filePath,
                    projectRoot
                );

                if (resolved) {
                    const normTarget = path.normalize(resolved);

                    // Prevent self-loops
                    if (normTarget === normalizedSource) continue;

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
        } catch (err) {
            // Skip files that can't be read
        }
    }

    return { nodes, edges };
}

/**
 * Convenience function with simpler signature for backwards compatibility
 */
export async function analyze(scanPath: string): Promise<DependencyGraph> {
    return analyzeDependencies({ scanPath });
}
