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
exports.readTools = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const mammoth_1 = __importDefault(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
const utils_1 = require("./utils");
// Initialize PDF support
(0, utils_1.polyfillDOM)();
// @ts-ignore
let pdf;
try {
    pdf = require('pdf-parse');
}
catch (e) {
    console.error('Failed to load pdf-parse:', e);
}
const scanner_1 = require("./scanner");
exports.readTools = {
    // Efficiently count files matching criteria
    async countFiles({ path: dirPath, recursive = false, extensions, pattern }) {
        try {
            const files = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive,
                extensions,
                pattern
            });
            return files.length;
        }
        catch (error) {
            console.error('Error counting files:', error);
            return 0;
        }
    },
    async checkFileExists({ path: filePath }) {
        try {
            await promises_1.default.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    },
    async listFiles({ path: dirPath, recursive = false, sort = 'name', extensions }) {
        try {
            // Use efficient scanner
            const filePaths = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive,
                extensions
            });
            const files = await Promise.all(filePaths.map(async (filePath) => {
                try {
                    const stats = await promises_1.default.stat(filePath);
                    const isDirectory = stats.isDirectory();
                    let childCount;
                    if (isDirectory) {
                        try {
                            const children = await promises_1.default.readdir(filePath);
                            childCount = children.length;
                        }
                        catch {
                            childCount = 0;
                        }
                    }
                    return {
                        name: path_1.default.basename(filePath),
                        path: filePath,
                        isDirectory,
                        size: stats.size,
                        lastModified: stats.mtimeMs,
                        childCount
                    };
                }
                catch {
                    return null;
                }
            })).then(results => results.filter((f) => f !== null));
            // Sorting
            return files.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory)
                    return -1;
                if (!a.isDirectory && b.isDirectory)
                    return 1;
                switch (sort) {
                    case 'newest': return b.lastModified - a.lastModified;
                    case 'oldest': return a.lastModified - b.lastModified;
                    case 'type': {
                        const extA = path_1.default.extname(a.name).toLowerCase();
                        const extB = path_1.default.extname(b.name).toLowerCase();
                        return extA.localeCompare(extB);
                    }
                    case 'name':
                    default:
                        return a.name.localeCompare(b.name);
                }
            });
        }
        catch (error) {
            console.error('Error listing files:', error);
            return [];
        }
    },
    async readFile({ path: filePath }) {
        try {
            const ext = path_1.default.extname(filePath).toLowerCase();
            if (ext === '.pdf') {
                if (!pdf) {
                    console.error('PDF module not loaded. Attempting to load...');
                    try {
                        pdf = require('pdf-parse');
                    }
                    catch (e) {
                        throw new Error('PDF support is not available. The pdf-parse module could not be loaded.');
                    }
                }
                try {
                    const dataBuffer = await promises_1.default.readFile(filePath);
                    const data = await pdf(dataBuffer);
                    return data.text || 'PDF text extraction returned empty content.';
                }
                catch (pdfErr) {
                    console.error('PDF parsing error:', pdfErr);
                    throw new Error(`Failed to parse PDF: ${pdfErr.message}`);
                }
            }
            if (ext === '.docx') {
                const buffer = await promises_1.default.readFile(filePath);
                const result = await mammoth_1.default.extractRawText({ buffer });
                return result.value;
            }
            if (ext === '.xlsx' || ext === '.xls') {
                const buffer = await promises_1.default.readFile(filePath);
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                let content = '';
                workbook.SheetNames.forEach(sheetName => {
                    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                    content += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
                });
                return content;
            }
            // Default to text/utf-8
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            return content;
        }
        catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    },
    async getDirectoryStats({ path: dirPath }) {
        let totalFiles = 0;
        let totalFolders = 0;
        let totalBytes = 0;
        const byType = {};
        // Use object wrapper to avoid TypeScript closure narrowing issues
        const tracker = { oldest: null, newest: null };
        async function scan(dir) {
            try {
                const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path_1.default.join(dir, entry.name);
                    try {
                        const stats = await promises_1.default.stat(fullPath);
                        if (entry.isDirectory()) {
                            totalFolders++;
                            await scan(fullPath);
                        }
                        else {
                            totalFiles++;
                            totalBytes += stats.size;
                            // Track by extension
                            const ext = path_1.default.extname(entry.name).toLowerCase().slice(1) || 'no extension';
                            if (!byType[ext])
                                byType[ext] = { count: 0, size: 0 };
                            byType[ext].count++;
                            byType[ext].size += stats.size;
                            // Track oldest/newest
                            if (!tracker.oldest || stats.mtimeMs < tracker.oldest.date) {
                                tracker.oldest = { name: entry.name, date: stats.mtimeMs };
                            }
                            if (!tracker.newest || stats.mtimeMs > tracker.newest.date) {
                                tracker.newest = { name: entry.name, date: stats.mtimeMs };
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
        await scan(dirPath);
        // Format size
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
        const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
        const sizeStr = totalBytes > 1024 * 1024 * 1024 ? `${totalGB} GB` : `${totalMB} MB`;
        // Sort byType by count and limit to top 10
        const sortedTypes = Object.entries(byType)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
        // Copy from tracker object
        const oldestInfo = tracker.oldest;
        const newestInfo = tracker.newest;
        return {
            totalFiles,
            totalFolders,
            totalSize: sizeStr,
            byType: sortedTypes,
            oldest: oldestInfo ? { name: oldestInfo.name, date: new Date(oldestInfo.date).toLocaleDateString() } : undefined,
            newest: newestInfo ? { name: newestInfo.name, date: new Date(newestInfo.date).toLocaleDateString() } : undefined,
        };
    },
    /**
     * Search inside file contents for a query string
     * Supports: text files, PDF, DOCX
     */
    async searchContent({ directory, query, extensions, caseSensitive = false, maxResults = 20 }) {
        const matches = [];
        let searchedFiles = 0;
        // Default to common text/document extensions
        const searchExtensions = extensions || ['txt', 'md', 'json', 'js', 'ts', 'py', 'pdf', 'docx', 'html', 'css', 'log', 'csv'];
        try {
            const files = await scanner_1.FileSystemScanner.scan({
                path: directory,
                recursive: true,
                extensions: searchExtensions
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
                    if (ext === 'pdf' && pdf) {
                        const buffer = await promises_1.default.readFile(filePath);
                        const data = await pdf(buffer);
                        content = data.text;
                    }
                    else if (ext === 'docx') {
                        const buffer = await promises_1.default.readFile(filePath);
                        const result = await mammoth_1.default.extractRawText({ buffer });
                        content = result.value;
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
            throw new Error(`Search failed: ${error.message}`);
        }
    },
};
