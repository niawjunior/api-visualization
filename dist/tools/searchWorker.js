"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
// Imports moved to lazy load inside searchContent
// to prevent warnings/errors on worker startup when not searching.
worker_threads_1.parentPort?.on('message', async (task) => {
    try {
        if (task.type === 'search') {
            const results = await searchContent(task.payload);
            worker_threads_1.parentPort?.postMessage({ type: 'success', results });
        }
        else if (task.type === 'stats') {
            const results = await getDirectoryStats(task.payload.path);
            worker_threads_1.parentPort?.postMessage({ type: 'success', results });
        }
        else if (task.type === 'size') {
            const results = await calculateFolderSize(task.payload.path);
            worker_threads_1.parentPort?.postMessage({ type: 'success', results });
        }
        else if (task.type === 'deps') {
            // Special handling for Python projects to use AST-based bulk analysis
            const { pythonFrameworkAnalyzer, analyzePythonDependencies } = await Promise.resolve().then(() => __importStar(require('./lib/analyzers/python')));
            const isPython = await pythonFrameworkAnalyzer.detect(task.payload.path, {});
            if (isPython) {
                const results = await analyzePythonDependencies(task.payload.path);
                worker_threads_1.parentPort?.postMessage({ type: 'success', results });
            }
            else {
                const results = await (0, analyzers_1.analyze)(task.payload.path);
                worker_threads_1.parentPort?.postMessage({ type: 'success', results });
            }
        }
        else if (task.type === 'detect-project') {
            const { detectProject } = await Promise.resolve().then(() => __importStar(require('./lib/project-detection')));
            const results = await detectProject(task.payload.path);
            worker_threads_1.parentPort?.postMessage({ type: 'success', results });
        }
        else if (task.type === 'analyze-route') {
            const filePath = task.payload.path;
            // IMMEDIATE DEBUG LOG
            try {
                const fs = require('fs');
                fs.appendFileSync('/Users/niawjunior/Desktop/api-visualization/worker_debug_source.log', `\n[START] Analyze Route: ${filePath}\n`);
            }
            catch (e) {
                console.error('Log Write Failed', e);
            }
            if (filePath.endsWith('.py')) {
                const { analyzePythonEndpoints } = await Promise.resolve().then(() => __importStar(require('./lib/analyzers/python/analyzer')));
                const dir = path_1.default.dirname(filePath);
                // Run scanner on the directory of the file
                const endpoints = await analyzePythonEndpoints(dir);
                // Find the specific endpoint that matches the file
                let match = endpoints.find(e => e.filePath === filePath);
                // Robust matching fallback
                if (!match) {
                    try {
                        const normalizedTarget = path_1.default.normalize(filePath).toLowerCase();
                        match = endpoints.find(e => path_1.default.normalize(e.filePath).toLowerCase() === normalizedTarget);
                    }
                    catch (e) { }
                }
                // Debug Logger (Sync)
                try {
                    const fs = require('fs');
                    const logPath = '/Users/niawjunior/Desktop/api-visualization/worker_debug_source.log';
                    const logData = [
                        `[Result] Target: ${filePath}`,
                        `Endpoints Found: ${endpoints.length}`,
                        ...endpoints.map((e) => ` - Candidate: ${e.filePath} (Match: ${e.filePath === filePath})`),
                        `Match Result: ${match ? 'FOUND' : 'MISSING'}\n`
                    ].join('\n');
                    fs.appendFileSync(logPath, logData);
                }
                catch (e) {
                    console.error('Worker Log Error:', e);
                }
                worker_threads_1.parentPort?.postMessage({ type: 'success', results: match || null }); // Return single object
            }
            else {
                const { analyzeRouteFile } = await Promise.resolve().then(() => __importStar(require('./lib/analyzers/nextjs')));
                const results = analyzeRouteFile(filePath);
                worker_threads_1.parentPort?.postMessage({ type: 'success', results });
            }
        }
    }
    catch (error) {
        worker_threads_1.parentPort?.postMessage({ type: 'error', error: error.message });
    }
});
async function getDirectoryStats(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;
    const types = {};
    async function scan(currentPath) {
        const entries = await promises_1.default.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.'))
                    continue;
                folderCount++;
                await scan(fullPath);
            }
            else if (entry.isFile()) {
                if (entry.name === '.DS_Store')
                    continue;
                fileCount++;
                try {
                    const stats = await promises_1.default.stat(fullPath);
                    totalSize += stats.size;
                    const ext = path_1.default.extname(entry.name).toLowerCase().replace('.', '') || 'unknown';
                    types[ext] = (types[ext] || 0) + 1;
                }
                catch (e) { }
            }
        }
    }
    await scan(dirPath);
    return { totalSize, fileCount, folderCount, types };
}
async function calculateFolderSize(dirPath) {
    let totalSize = 0;
    async function scan(currentPath) {
        const entries = await promises_1.default.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.'))
                    continue;
                await scan(fullPath);
            }
            else if (entry.isFile()) {
                try {
                    const stats = await promises_1.default.stat(fullPath);
                    totalSize += stats.size;
                }
                catch (e) { }
            }
        }
    }
    await scan(dirPath);
    return totalSize;
}
async function searchContent({ directory, query, extensions, caseSensitive = false, maxResults = 20 }) {
    const matches = [];
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
        const files = await (0, glob_1.glob)(globPattern, {
            cwd: directory,
            dot: false,
            ignore: ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
            absolute: true
        });
        const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
        for (const filePath of files) {
            if (matches.length >= maxResults)
                break;
            const ext = path_1.default.extname(filePath).toLowerCase().slice(1);
            searchedFiles++;
            try {
                let content = '';
                // Read content based on file type
                // Read content based on file type
                if (ext === 'pdf') {
                    try {
                        // Lazy load pdf-parse with minimal polyfills if needed
                        const globalAny = global;
                        if (!globalAny.window)
                            globalAny.window = {};
                        if (!globalAny.document)
                            globalAny.document = { createElement: () => ({}), createElementNS: () => ({}) };
                        const pdf = require('pdf-parse');
                        const buffer = await promises_1.default.readFile(filePath);
                        const data = await pdf(buffer);
                        content = data.text;
                    }
                    catch (e) {
                        console.warn('PDF parse failed', e);
                    }
                }
                else if (ext === 'docx') {
                    try {
                        const mammoth = require('mammoth');
                        const buffer = await promises_1.default.readFile(filePath);
                        const result = await mammoth.extractRawText({ buffer });
                        content = result.value;
                    }
                    catch (e) {
                        console.warn('DOCX parse failed', e);
                    }
                }
                else {
                    // Text file - read directly
                    const stats = await promises_1.default.stat(filePath);
                    if (stats.size > 5 * 1024 * 1024)
                        continue; // Skip files > 5MB
                    content = await promises_1.default.readFile(filePath, 'utf-8');
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
                        if (matches.length >= maxResults)
                            break;
                    }
                    searchRegex.lastIndex = 0; // Reset regex state
                }
            }
            catch (err) {
                // Skip files that can't be read
                continue;
            }
        }
        return {
            matches,
            totalMatches: matches.length,
            searchedFiles
        };
    }
    catch (error) {
        throw new Error(`Worker Search failed: ${error.message}`);
    }
}
// Import the modular dependency analyzer
const analyzers_1 = require("./lib/analyzers");
