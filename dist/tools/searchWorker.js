"use strict";
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
            const results = await analyzeDependencies(task.payload.path);
            worker_threads_1.parentPort?.postMessage({ type: 'success', results });
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
// Helper to find project root (where package.json is)
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
    return startPath; // Fallback to startPath if not found
}
async function analyzeDependencies(scanPath) {
    const nodes = [];
    const edges = [];
    // 1. Determine Root for Aliases
    const projectRoot = await findProjectRoot(scanPath);
    const extensions = ['ts', 'tsx', 'js', 'jsx', 'vue'];
    // 2. Gather source files in the current scan path
    const files = await (0, glob_1.glob)(`**/*.{${extensions.join(',')}}`, {
        cwd: scanPath,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.output/**'],
        absolute: true
    });
    const scannedPaths = new Set(files.map(f => path_1.default.normalize(f)));
    const addedNodes = new Set();
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
    // Add all scanned files as nodes initially
    files.forEach(f => addNode(f, false));
    // Cache existence checks to avoid repetitive FS calls
    const existenceCache = new Map();
    const resolvePathOnDisk = async (absPath) => {
        if (existenceCache.has(absPath))
            return existenceCache.get(absPath);
        // Check exact
        try {
            const stats = await promises_1.default.stat(absPath);
            if (stats.isFile()) {
                existenceCache.set(absPath, absPath);
                return absPath;
            }
        }
        catch { }
        // Check extensions
        for (const ext of extensions) {
            const p = `${absPath}.${ext}`;
            try {
                if ((await promises_1.default.stat(p)).isFile()) {
                    existenceCache.set(absPath, p);
                    return p;
                }
            }
            catch { }
        }
        // Check index
        for (const ext of extensions) {
            const p = path_1.default.join(absPath, `index.${ext}`);
            try {
                if ((await promises_1.default.stat(p)).isFile()) {
                    existenceCache.set(absPath, p);
                    return p;
                }
            }
            catch { }
        }
        existenceCache.set(absPath, null);
        return null;
    };
    // 3. Process Imports
    for (const filePath of files) {
        const normalizedSource = path_1.default.normalize(filePath);
        try {
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            // Regex for imports
            const fromRegex = /(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g;
            const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
            const foundImports = new Set();
            let match;
            while ((match = fromRegex.exec(content)) !== null)
                foundImports.add(match[1]);
            while ((match = sideEffectRegex.exec(content)) !== null)
                foundImports.add(match[1]);
            for (const importPath of Array.from(foundImports)) {
                let potentialAbs = null;
                if (importPath.startsWith('.')) {
                    // Relative
                    potentialAbs = path_1.default.resolve(path_1.default.dirname(normalizedSource), importPath);
                }
                else if (importPath.startsWith('/')) {
                    // Absolute system path (rare in JS imports, but possible)
                    potentialAbs = importPath;
                }
                else {
                    // Bare specifier (Alias or Package or BaseUrl)
                    // Check 1: Alias @/ or ~/
                    if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
                        const subPath = importPath.substring(2);
                        potentialAbs = path_1.default.join(projectRoot, subPath);
                        if (!(await resolvePathOnDisk(potentialAbs))) {
                            potentialAbs = path_1.default.join(projectRoot, 'src', subPath);
                        }
                    }
                    // Check 2: BaseUrl / Root-relative (e.g. "components/button")
                    // If we haven't found it yet, try resolving from project root and src
                    if (!potentialAbs || !(await resolvePathOnDisk(potentialAbs))) {
                        const rootAttempt = path_1.default.join(projectRoot, importPath);
                        if (await resolvePathOnDisk(rootAttempt)) {
                            potentialAbs = rootAttempt;
                        }
                        else {
                            const srcAttempt = path_1.default.join(projectRoot, 'src', importPath);
                            if (await resolvePathOnDisk(srcAttempt)) {
                                potentialAbs = srcAttempt;
                            }
                        }
                    }
                }
                if (potentialAbs) {
                    const resolved = await resolvePathOnDisk(potentialAbs);
                    if (resolved) {
                        const normTarget = path_1.default.normalize(resolved);
                        // Prevent self-loops
                        if (normTarget === normalizedSource)
                            continue;
                        // If unresolved node (external to current scan), add it
                        if (!scannedPaths.has(normTarget)) {
                            addNode(normTarget, true);
                        }
                        edges.push({ source: normalizedSource, target: normTarget });
                    }
                }
            }
        }
        catch (err) { }
    }
    return { nodes, edges };
}
