import { parentPort, workerData } from 'worker_threads';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
// Imports moved to lazy load inside searchContent
// to prevent warnings/errors on worker startup when not searching.

parentPort?.on('message', async (task) => {
    try {
        if (task.type === 'search') {
            const results = await searchContent(task.payload);
            parentPort?.postMessage({ type: 'success', results });
        } else if (task.type === 'stats') {
            const results = await getDirectoryStats(task.payload.path);
            parentPort?.postMessage({ type: 'success', results });
        } else if (task.type === 'size') {
            const results = await calculateFolderSize(task.payload.path);
            parentPort?.postMessage({ type: 'success', results });
        } else if (task.type === 'deps') {
            // Special handling for Python projects to use AST-based bulk analysis
            const { pythonFrameworkAnalyzer, analyzePythonDependencies } = await import('./lib/analyzers/python');
            const isPython = await pythonFrameworkAnalyzer.detect(task.payload.path, {});
            
            if (isPython) {
                 const results = await analyzePythonDependencies(task.payload.path);
                 parentPort?.postMessage({ type: 'success', results });
            } else {
                 const results = await analyzeDependencies(task.payload.path);
                 parentPort?.postMessage({ type: 'success', results });
            }
        } else if (task.type === 'detect-project') {
            const { detectProject } = await import('./lib/project-detection');
            const results = await detectProject(task.payload.path);
            parentPort?.postMessage({ type: 'success', results });
        } else if (task.type === 'analyze-route') {
            const filePath = task.payload.path;


            if (filePath.endsWith('.py')) {
                 const { analyzePythonEndpoints } = await import('./lib/analyzers/python/analyzer');
                 
                 const dir = path.dirname(filePath);
                 
                 // Run scanner on the directory of the file
                 const endpoints = await analyzePythonEndpoints(dir);
                 
                 // Find the specific endpoint that matches the file
                 let match = endpoints.find(e => e.filePath === filePath);
                 
                 // Robust matching fallback
                 if (!match) {
                     try {
                         const normalizedTarget = path.normalize(filePath).toLowerCase();
                         match = endpoints.find(e => path.normalize(e.filePath).toLowerCase() === normalizedTarget);
                     } catch (e) {}
                 }


                 
                 parentPort?.postMessage({ type: 'success', results: match || null }); // Return single object
            } else {
                const { analyzeRouteFile } = await import('./lib/analyzers/nextjs');
                const results = analyzeRouteFile(filePath);
                parentPort?.postMessage({ type: 'success', results });
            }
        }
    } catch (error: any) {
        parentPort?.postMessage({ type: 'error', error: error.message });
    }
});

async function getDirectoryStats(dirPath: string) {
    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;
    const types: Record<string, number> = {};

    async function scan(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                folderCount++;
                await scan(fullPath);
            } else if (entry.isFile()) {
                if (entry.name === '.DS_Store') continue;
                fileCount++;
                try {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                    
                    const ext = path.extname(entry.name).toLowerCase().replace('.', '') || 'unknown';
                    types[ext] = (types[ext] || 0) + 1;
                } catch (e) {}
            }
        }
    }

    await scan(dirPath);
    return { totalSize, fileCount, folderCount, types };
}

async function calculateFolderSize(dirPath: string) {
     let totalSize = 0;
     async function scan(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                await scan(fullPath);
            } else if (entry.isFile()) {
                try {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                } catch (e) {}
            }
        }
     }
     await scan(dirPath);
     return totalSize;
}

interface SearchOptions {
    directory: string; 
    query: string;
    extensions?: string[];
    caseSensitive?: boolean;
    maxResults?: number;
}

async function searchContent({ 
  directory, 
  query, 
  extensions,
  caseSensitive = false,
  maxResults = 20 
}: SearchOptions) {
    const matches: Array<{ file: string; preview: string; lineNumber?: number }> = [];
    let searchedFiles = 0;
    
    // Default to common text/document extensions
    const searchExtensions = extensions || ['txt', 'md', 'json', 'js', 'ts', 'py', 'pdf', 'docx', 'html', 'css', 'log', 'csv'];
    
    // 1. Scan files (Inline glob logic to avoid dependency on FileSystemScanner class if tricky to import)
    // Borrowed simplified scanning
    let globPattern = '**/*';
    if (searchExtensions && searchExtensions.length > 0) {
      const extPattern = searchExtensions.length === 1 
        ? searchExtensions[0] 
        : `{${searchExtensions.join(',')}}`;
      globPattern = `**/*.${extPattern}`;
    }

    try {
        const files = await glob(globPattern, {
            cwd: directory,
            dot: false,
            ignore: ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
            absolute: true 
        });

        const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');

        for (const filePath of files) {
            if (matches.length >= maxResults) break;
            
            const ext = path.extname(filePath).toLowerCase().slice(1);
            searchedFiles++;
            
            try {
                let content = '';
                
                // Read content based on file type
                // Read content based on file type
                if (ext === 'pdf') {
                    try {
                        // Lazy load pdf-parse with minimal polyfills if needed
                        const globalAny: any = global;
                        if (!globalAny.window) globalAny.window = {};
                        if (!globalAny.document) globalAny.document = { createElement: () => ({}), createElementNS: () => ({}) };
                        
                        const pdf = require('pdf-parse');
                        const buffer = await fs.readFile(filePath);
                        const data = await pdf(buffer);
                        content = data.text;
                    } catch (e) { console.warn('PDF parse failed', e); }
                } else if (ext === 'docx') {
                    try {
                        const mammoth = require('mammoth');
                        const buffer = await fs.readFile(filePath);
                        const result = await mammoth.extractRawText({ buffer });
                        content = result.value;
                    } catch (e) { console.warn('DOCX parse failed', e); }
                } else {
                    // Text file - read directly
                    const stats = await fs.stat(filePath);
                    if (stats.size > 5 * 1024 * 1024) continue; // Skip files > 5MB
                    content = await fs.readFile(filePath, 'utf-8');
                }
                
                // Search for matches
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (searchRegex.test(lines[i])) {
                        // Get context around match
                        const preview = lines[i].trim().substring(0, 150) + (lines[i].length > 150 ? '...' : '');
                        matches.push({
                            file: filePath,
                            preview,
                            lineNumber: ext === 'pdf' || ext === 'docx' ? undefined : i + 1
                        });
                        
                        if (matches.length >= maxResults) break;
                    }
                    searchRegex.lastIndex = 0; // Reset regex state
                }
            } catch (err) {
                // Skip files that can't be read
                continue;
            }
        }
        
        return {
            matches,
            totalMatches: matches.length,
            searchedFiles
        };

    } catch (error: any) {
        throw new Error(`Worker Search failed: ${error.message}`);
    }
}


// Import the modular dependency analyzer
import { analyze as analyzeDependencies } from './lib/analyzers';
