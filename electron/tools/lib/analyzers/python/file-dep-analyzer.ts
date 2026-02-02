
import path from 'path';
import fs from 'fs/promises';
import { LanguageAnalyzer, ImportMatch } from '../types';

export const pythonFileDependencyAnalyzer: LanguageAnalyzer = {
    name: 'python-file-deps',
    extensions: ['py'],
    ignorePatterns: ['**/__pycache__/**', '**/venv/**', '**/env/**'],

    parseImports(content: string, filePath: string): ImportMatch[] {
        const imports: ImportMatch[] = [];
        const lines = content.split('\n');

        // Regex for 'import x' and 'from x import y'
        // Very basic implementation:
        // 1. `from .sub import y` -> .sub
        // 2. `from ..sub import y` -> ..sub
        // 3. `from module import y` -> module
        // 4. `import module` -> module
        
        const fromImportRegex = /^\s*from\s+([\w\.]+)\s+import/
        const relativeFromImportRegex = /^\s*from\s+(\.*[\w\.]*)\s+import/
        const importRegex = /^\s*import\s+([\w\.,\s]+)/

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // from ... import ...
            const fromMatch = line.match(relativeFromImportRegex);
            if (fromMatch) {
                // e.g. "from .core import" -> ".core"
                // e.g. "from app.api import" -> "app.api"
                imports.push({
                    importPath: fromMatch[1],
                    importType: 'static',
                    line: i + 1
                });
                continue;
            }

            // import ...
            const importMatch = line.match(importRegex);
            if (importMatch) {
                // e.g. "import os, sys"
                const modules = importMatch[1].split(',').map(s => s.trim());
                for (const mod of modules) {
                    const rootMod = mod.split('.')[0]; // rough
                    imports.push({
                        importPath: rootMod, // Only link to root module for now? Or full path? 
                        // Actually import resolution usually wants the dotted path to check if it's a file
                        importType: 'static',
                        line: i + 1
                    });
                }
            }
        }
        return imports;
    },

    async resolveImport(importPath: string, fromFile: string, projectRoot: string): Promise<string | null> {
        // Simple Python resolution strategy
        // 1. If starts with dot, relative to current file
        // 2. If not dot, relative to projectRoot (assuming absolute imports usually start from project root in these apps)
        
        const fileDir = path.dirname(fromFile);
        
        let potentialPaths: string[] = [];

        if (importPath.startsWith('.')) {
            // Relative resolution
            // . means current dir
            // .. means parent
            
            // We need to convert python dots to path separators
            // But leading dots have special meaning.
            
            // Count leading dots
            const match = importPath.match(/^(\.+)(.*)/);
            if (!match) return null;
            
            const dots = match[1].length;
            const remainder = match[2]; // "core.utils"
            
            // 1 dot = current dir (no step up)
            // 2 dots = 1 step up
            let targetDir = fileDir;
            for (let i = 1; i < dots; i++) {
                targetDir = path.dirname(targetDir);
            }
            
            const relativePath = remainder.replace(/\./g, '/');
            
            if (relativePath === '') {
                // importing the package itself (init)
                potentialPaths.push(path.join(targetDir, '__init__.py'));
            } else {
                potentialPaths.push(path.join(targetDir, relativePath + '.py'));
                potentialPaths.push(path.join(targetDir, relativePath, '__init__.py'));
            }
            
        } else {
            // Absolute resolution (relative to project root usually)
            const relativePath = importPath.replace(/\./g, '/');
            potentialPaths.push(path.join(projectRoot, relativePath + '.py'));
            potentialPaths.push(path.join(projectRoot, relativePath, '__init__.py'));
            
            // Also try relative to current file (implicit relative imports - rare in py3 but possible if sys.path setup)
             potentialPaths.push(path.join(fileDir, relativePath + '.py'));
        }

        for (const p of potentialPaths) {
            try {
                await fs.access(p);
                return p;
            } catch {
                continue;
            }
        }
        
        return null;
    }
};
