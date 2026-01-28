import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

export async function getDirectoryStats(dirPath: string) {
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

export async function listFiles(dirPath: string) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        // Return simple file info
        const result = await Promise.all(entries.map(async (entry) => {
             const fullPath = path.join(dirPath, entry.name);
             let size = 0;
             let lastModified = 0;
             let childCount = undefined;
             
             if (entry.isFile()) {
                 const stats = await fs.stat(fullPath);
                 size = stats.size;
                 lastModified = stats.mtimeMs;
             } else if (entry.isDirectory()) {
                 lastModified = (await fs.stat(fullPath)).mtimeMs;
                 // Don't count children deep to save perf, maybe just readdir checks
             }

             return {
                 name: entry.name,
                 path: fullPath,
                 isDirectory: entry.isDirectory(),
                 size,
                 lastModified,
                 childCount
             };
        }));
        
        // Filter out hidden/system files if desired
        return result.filter(f => !f.name.startsWith('.') && f.name !== 'node_modules');

    } catch (error) {
        console.error("List files error", error);
        return [];
    }
}

interface SearchOptions {
    directory: string; 
    query: string;
    extensions?: string[];
    caseSensitive?: boolean;
    maxResults?: number;
}

export async function searchContent({ 
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
                // Simplified for web port: only text files for now
                if (ext === 'pdf' || ext === 'docx') {
                    // Skip binary/complex formats for this quick port unless we add pdf-parse/mammoth deps
                    continue; 
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
                            lineNumber: i + 1
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

export async function readTextFile(currPath: string) {
    try {
        const stats = await fs.stat(currPath);
        if (stats.size > 10 * 1024 * 1024) throw new Error("File too large");
        return await fs.readFile(currPath, 'utf-8');
    } catch (e: any) {
        throw new Error(`Failed to read file: ${e.message}`);
    }
}

export async function readImageAsBase64(currPath: string) {
    try {
        const buffer = await fs.readFile(currPath);
        const ext = path.extname(currPath).toLowerCase().slice(1);
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (e: any) {
         throw new Error(`Failed to read image: ${e.message}`);
    }
}
