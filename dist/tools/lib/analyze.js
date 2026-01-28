"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTools = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const scanner_1 = require("./scanner");
exports.analyzeTools = {
    async getDirectoryStats({ path: dirPath }) {
        const types = {};
        let totalSize = 0;
        let fileCount = 0;
        let folderCount = 0;
        let newestFile;
        let oldestFile;
        try {
            const filePaths = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive: true
            });
            for (const filePath of filePaths) {
                try {
                    const stats = await promises_1.default.stat(filePath);
                    totalSize += stats.size;
                    fileCount++;
                    const ext = path_1.default.extname(filePath).toLowerCase().replace('.', '') || 'unknown';
                    types[ext] = (types[ext] || 0) + 1;
                    if (!newestFile || stats.mtimeMs > newestFile.date) {
                        newestFile = { name: path_1.default.basename(filePath), path: filePath, date: stats.mtimeMs };
                    }
                    if (!oldestFile || stats.mtimeMs < oldestFile.date) {
                        oldestFile = { name: path_1.default.basename(filePath), path: filePath, date: stats.mtimeMs };
                    }
                }
                catch { }
            }
            // Count folders separately? Scanner only returns files.
            // If we need accurate folder count, we might need a different scan or just recursive readdir.
            // For dashboard "Stats", files is most important. We can skip folder count or approximate it.
            // For now let's just count files.
        }
        catch (error) {
            console.error(`Failed to get directory stats: ${error.message}`);
        }
        return { totalSize, fileCount, folderCount, types, newestFile, oldestFile };
    },
    // ... findLargeFiles implementation (unchanged) ...
    async findLargeFiles({ path: dirPath, minSizeMB = 100, recursive = true }) {
        const minBytes = minSizeMB * 1024 * 1024;
        const largeFiles = [];
        try {
            const filePaths = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive
            });
            for (const filePath of filePaths) {
                try {
                    const stats = await promises_1.default.stat(filePath);
                    if (stats.size >= minBytes) {
                        largeFiles.push({
                            name: path_1.default.basename(filePath),
                            path: filePath,
                            isDirectory: false,
                            size: stats.size,
                            lastModified: stats.mtimeMs,
                        });
                    }
                }
                catch { }
            }
        }
        catch (error) {
            console.error('Error finding large files:', error);
        }
        // Sort by size descending
        largeFiles.sort((a, b) => b.size - a.size);
        // Calculate total
        const totalBytes = largeFiles.reduce((sum, f) => sum + f.size, 0);
        const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
        return {
            files: largeFiles.slice(0, 20), // Limit for AI context
            totalSize: `${totalGB} GB in ${largeFiles.length} large files (>${minSizeMB}MB each)`
        };
    },
    async findDuplicates({ path: dirPath, method = 'size', recursive = true }) {
        const fileMap = new Map();
        try {
            const filePaths = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive
            });
            // Optimization: For content hashing, first group by size to avoid hashing everything
            if (method === 'content') {
                const sizeMap = new Map();
                for (const filePath of filePaths) {
                    try {
                        const stats = await promises_1.default.stat(filePath);
                        if (!stats.isFile())
                            continue;
                        if (!sizeMap.has(stats.size))
                            sizeMap.set(stats.size, []);
                        sizeMap.get(stats.size).push(filePath);
                    }
                    catch { }
                }
                // Only hash files that share a size group
                for (const [size, candidates] of Array.from(sizeMap.entries())) {
                    if (candidates.length < 2)
                        continue; // Unique size = unique content
                    if (size === 0)
                        continue; // Ignore empty files
                    for (const filePath of candidates) {
                        try {
                            const fileBuffer = await promises_1.default.readFile(filePath);
                            const hash = crypto_1.default.createHash('md5').update(fileBuffer).digest('hex');
                            const key = `${size}_${hash}`;
                            if (!fileMap.has(key))
                                fileMap.set(key, []);
                            fileMap.get(key).push(filePath);
                        }
                        catch { }
                    }
                }
            }
            else {
                // Standard methods
                for (const filePath of filePaths) {
                    try {
                        const stats = await promises_1.default.stat(filePath);
                        const name = path_1.default.basename(filePath);
                        let key;
                        if (method === 'name') {
                            key = name.toLowerCase();
                        }
                        else if (method === 'both') {
                            key = `${name.toLowerCase()}_${stats.size}`;
                        }
                        else {
                            key = `${stats.size}`; // size only
                        }
                        if (!fileMap.has(key))
                            fileMap.set(key, []);
                        fileMap.get(key).push(filePath);
                    }
                    catch { }
                }
            }
        }
        catch (error) {
            console.error('Error finding duplicates:', error);
        }
        // Filter to only duplicates (2+ files with same key)
        const duplicates = Array.from(fileMap.entries())
            .filter(([_, files]) => files.length > 1)
            .map(([key, files]) => ({ key, files }))
            .sort((a, b) => b.files.length - a.files.length)
            .slice(0, 10); // Limit for AI context
        const totalDuplicates = duplicates.reduce((sum, g) => sum + g.files.length, 0);
        return { groups: duplicates, totalDuplicates };
    },
    async analyzeFolder({ path: dirPath }) {
        // Category mappings (same as organizeByType)
        const typeMap = {
            jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images',
            webp: 'Images', svg: 'Images', heic: 'Images', bmp: 'Images',
            pdf: 'Documents', doc: 'Documents', docx: 'Documents', txt: 'Documents',
            rtf: 'Documents', pages: 'Documents',
            xls: 'Spreadsheets', xlsx: 'Spreadsheets', csv: 'Spreadsheets', numbers: 'Spreadsheets',
            ppt: 'Presentations', pptx: 'Presentations', key: 'Presentations',
            mp4: 'Videos', mov: 'Videos', avi: 'Videos', mkv: 'Videos', webm: 'Videos',
            mp3: 'Audio', wav: 'Audio', flac: 'Audio', m4a: 'Audio', aac: 'Audio',
            zip: 'Archives', rar: 'Archives', '7z': 'Archives', tar: 'Archives', gz: 'Archives', dmg: 'Archives',
            js: 'Code', ts: 'Code', py: 'Code', java: 'Code', html: 'Code', css: 'Code', json: 'Code',
        };
        const categories = {};
        const sizeMap = new Map(); // For duplicate detection
        let totalFiles = 0;
        let totalFolders = 0;
        try {
            const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    totalFolders++;
                    continue;
                }
                totalFiles++;
                const fullPath = path_1.default.join(dirPath, entry.name);
                const ext = path_1.default.extname(entry.name).toLowerCase().slice(1);
                const category = typeMap[ext] || 'Other';
                if (!categories[category]) {
                    categories[category] = { count: 0, examples: [] };
                }
                categories[category].count++;
                if (categories[category].examples.length < 3) {
                    categories[category].examples.push(entry.name);
                }
                // Track file sizes for duplicate detection
                try {
                    const stats = await promises_1.default.stat(fullPath);
                    if (!sizeMap.has(stats.size))
                        sizeMap.set(stats.size, []);
                    sizeMap.get(stats.size).push(entry.name);
                }
                catch { }
            }
            // Count potential duplicates (files with same size)
            let potentialDuplicates = 0;
            for (const files of Array.from(sizeMap.values())) {
                if (files.length > 1)
                    potentialDuplicates += files.length;
            }
            // Generate suggestions
            const suggestions = [];
            const categoryCount = Object.keys(categories).length;
            if (categoryCount > 3) {
                suggestions.push(`Organize into ${categoryCount} folders by file type`);
            }
            if (categories['Images']?.count > 10) {
                suggestions.push(`Move ${categories['Images'].count} images to Images folder`);
            }
            if (categories['Videos']?.count > 5) {
                suggestions.push(`Move ${categories['Videos'].count} videos to Videos folder`);
            }
            if (potentialDuplicates > 0) {
                suggestions.push(`Review ${potentialDuplicates} potential duplicate files`);
            }
            if (categories['Other']?.count > 10) {
                suggestions.push(`Sort ${categories['Other'].count} miscellaneous files`);
            }
            return {
                totalFiles,
                totalFolders,
                categories,
                potentialDuplicates,
                suggestions,
            };
        }
        catch (error) {
            throw new Error(`Failed to analyze folder: ${error.message}`);
        }
    },
    async calculateFolderSize({ path: dirPath }) {
        try {
            const filePaths = await scanner_1.FileSystemScanner.scan({
                path: dirPath,
                recursive: true
            });
            let totalSize = 0;
            for (const filePath of filePaths) {
                try {
                    const stats = await promises_1.default.stat(filePath);
                    totalSize += stats.size;
                }
                catch { }
            }
            return totalSize;
        }
        catch (error) {
            throw new Error(`Failed to calculate folder size: ${error.message}`);
        }
    },
};
