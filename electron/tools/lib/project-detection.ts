import fs from 'fs/promises';
import path from 'path';
import { ProjectInfo, ProjectType } from './types';

/**
 * Find project root by walking up the directory tree looking for package.json
 */
/**
 * Find project root by walking up the directory tree looking for project markers
 */
async function findProjectRoot(startPath: string): Promise<{ path: string, type: 'node' | 'python' | 'unknown' } | null> {
    let current = startPath;
    const root = path.parse(current).root;
    
    // Safety check for empty path
    if (!current || current === '.') {
        return null;
    }

    while (true) {
        try {
            // Check for Node.js
            try {
                await fs.access(path.join(current, 'package.json'));
                return { path: current, type: 'node' };
            } catch {}

            // Check for Python
            const pythonMarkers = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'uv.lock'];
            for (const marker of pythonMarkers) {
                try {
                    await fs.access(path.join(current, marker));
                    return { path: current, type: 'python' };
                } catch {}
            }
            
            if (current === root) break;
            current = path.dirname(current);
        } catch {
            break;
        }
    }
    return null; // No project root found
}

export const detectProject = async (targetPath: string): Promise<ProjectInfo> => {
    const result: ProjectInfo = {
        path: targetPath,
        type: 'unknown',
        isProject: false
    };

    try {
        // 1. Find project root by walking up directories
        const found = await findProjectRoot(targetPath);
        
        if (!found) {
            return result; 
        }

        // Update path to project root
        result.path = found.path;
        result.isProject = true;

        if (found.type === 'node') {
            // 2. Read package.json from project root
            const packageJsonPath = path.join(found.path, 'package.json');
            const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(packageContent);
            
            result.name = pkg.name;
            result.version = pkg.version;
            result.dependencies = Object.keys(pkg.dependencies || {});
            result.devDependencies = Object.keys(pkg.devDependencies || {});

            // 3. Identify Node Framework
            const allDeps = [...(result.dependencies || []), ...(result.devDependencies || [])];

            if (allDeps.includes('next')) {
                result.type = 'nextjs';
            } else if (allDeps.includes('vite')) {
                result.type = 'vite';
            } else if (allDeps.includes('express') || allDeps.includes('nest') || allDeps.includes('fastify')) {
                result.type = 'node';
            } else {
                result.type = 'node'; // Generic Node project
            }

            // 4. Check for Config Files (Confirmation)
            const configFiles: string[] = [];
            const possibleConfigs = [
                'next.config.js', 'next.config.mjs', 'next.config.ts',
                'vite.config.js', 'vite.config.ts',
                'tsconfig.json',
                'tailwind.config.ts', 'tailwind.config.js'
            ];
            
            for (const file of possibleConfigs) {
                try {
                    await fs.access(path.join(found.path, file));
                    configFiles.push(file);
                } catch {}
            }
            result.configFiles = configFiles;

        } else if (found.type === 'python') {
            result.type = 'python';
            // Try to read name from pyproject.toml if simple regex match? 
            // For now just basic detection is enough to enable the UI tabs.
            result.name = path.basename(found.path); 
        }

    } catch (error) {
        // Error reading files -> Not a supported project or permission error
        console.error('Project detection error:', error);
        result.isProject = false;
    }

    return result;
};
