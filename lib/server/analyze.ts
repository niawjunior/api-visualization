import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Helper to find project root (where package.json is)
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
    return startPath; // Fallback to startPath if not found
}

export async function analyzeDependencies(scanPath: string) {
    const nodes: { id: string; label: string; type: 'file' | 'package' | 'external', isExternal?: boolean }[] = [];
    const edges: { source: string; target: string }[] = [];
    
    // 1. Determine Root for Aliases
    const projectRoot = await findProjectRoot(scanPath);
    
    const extensions = ['ts', 'tsx', 'js', 'jsx', 'vue'];
    
    // 2. Gather source files in the current scan path
    const files = await glob(`**/*.{${extensions.join(',')}}`, {
        cwd: scanPath,
        dot: false,
        ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.output/**'],
        absolute: true
    });

    const scannedPaths = new Set(files.map(f => path.normalize(f)));
    const addedNodes = new Set<string>();

    const addNode = (absPath: string, isExternal = false) => {
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

    // Add all scanned files as nodes initially
    files.forEach(f => addNode(f, false));

    // Cache existence checks to avoid repetitive FS calls
    const existenceCache = new Map<string, string | null>();

    const resolvePathOnDisk = async (absPath: string): Promise<string | null> => {
        if (existenceCache.has(absPath)) return existenceCache.get(absPath)!;
        
        // Check exact
        try {
            const stats = await fs.stat(absPath);
            if (stats.isFile()) {
                existenceCache.set(absPath, absPath);
                return absPath;
            }
        } catch {}

        // Check extensions
        for (const ext of extensions) {
            const p = `${absPath}.${ext}`;
            try {
                if ((await fs.stat(p)).isFile()) {
                     existenceCache.set(absPath, p);
                     return p;
                }
            } catch {}
        }

        // Check index
        for (const ext of extensions) {
            const p = path.join(absPath, `index.${ext}`);
             try {
                if ((await fs.stat(p)).isFile()) {
                     existenceCache.set(absPath, p);
                     return p;
                }
            } catch {}
        }

        existenceCache.set(absPath, null);
        return null;
    };


    // 3. Process Imports
    for (const filePath of files) {
        const normalizedSource = path.normalize(filePath);
        
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            // Regex for imports
            const fromRegex = /(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g;
            const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;

            const foundImports = new Set<string>();
            let match;
            while ((match = fromRegex.exec(content)) !== null) foundImports.add(match[1]);
            while ((match = sideEffectRegex.exec(content)) !== null) foundImports.add(match[1]);

            for (const importPath of Array.from(foundImports)) {
                let potentialAbs: string | null = null;

                if (importPath.startsWith('.')) {
                    // Relative
                    potentialAbs = path.resolve(path.dirname(normalizedSource), importPath);
                } else if (importPath.startsWith('/')) {
                     // Absolute system path (rare in JS imports, but possible)
                     potentialAbs = importPath;
                } else {
                    // Bare specifier (Alias or Package or BaseUrl)
                    // Check 1: Alias @/ or ~/
                    if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
                         const subPath = importPath.substring(2);
                         potentialAbs = path.join(projectRoot, subPath);
                         if (!(await resolvePathOnDisk(potentialAbs))) {
                             potentialAbs = path.join(projectRoot, 'src', subPath);
                         }
                    } 
                    
                    // Check 2: BaseUrl / Root-relative (e.g. "components/button")
                    // If we haven't found it yet, try resolving from project root and src
                    if (!potentialAbs || !(await resolvePathOnDisk(potentialAbs))) {
                        const rootAttempt = path.join(projectRoot, importPath);
                        if (await resolvePathOnDisk(rootAttempt)) {
                            potentialAbs = rootAttempt;
                        } else {
                            const srcAttempt = path.join(projectRoot, 'src', importPath);
                            if (await resolvePathOnDisk(srcAttempt)) {
                                 potentialAbs = srcAttempt;
                            }
                        }
                    }
                }
                
                if (potentialAbs) {
                    const resolved = await resolvePathOnDisk(potentialAbs);
                    if (resolved) {
                        const normTarget = path.normalize(resolved);
                        
                        // Prevent self-loops
                        if (normTarget === normalizedSource) continue;

                        // If unresolved node (external to current scan), add it
                        if (!scannedPaths.has(normTarget)) {
                            addNode(normTarget, true);
                        }
                        
                        edges.push({ source: normalizedSource, target: normTarget });
                    }
                }
            }
        } catch (err) { }
    }

    return { nodes, edges };
}
