import fs from 'fs/promises';
import path from 'path';
import { ProjectInfo, ProjectType } from './types';

/**
 * Find project root by walking up the directory tree looking for package.json
 */
async function findProjectRoot(startPath: string): Promise<string | null> {
    let current = startPath;
    const root = path.parse(current).root;
    
    while (current !== root) {
        try {
            const packageJsonPath = path.join(current, 'package.json');
            await fs.access(packageJsonPath);
            return current; // Found package.json
        } catch {
            current = path.dirname(current);
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
        const projectRoot = await findProjectRoot(targetPath);
        
        if (!projectRoot) {
            // No package.json found anywhere up the tree
            return result;
        }

        // Update path to project root (important for dependency analysis)
        result.path = projectRoot;
        
        // 2. Read package.json from project root
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(packageContent);
        
        result.isProject = true;
        result.name = pkg.name;
        result.version = pkg.version;
        result.dependencies = Object.keys(pkg.dependencies || {});
        result.devDependencies = Object.keys(pkg.devDependencies || {});

        // 3. Identify Project Type
        const allDeps = [...(result.dependencies || []), ...(result.devDependencies || [])];

        if (allDeps.includes('next')) {
            result.type = 'nextjs';
        } else if (allDeps.includes('vite')) {
            result.type = 'vite';
        } else if (allDeps.includes('express') || allDeps.includes('nest') || allDeps.includes('fastify')) {
            result.type = 'node';
        } else if (result.isProject) {
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
                await fs.access(path.join(projectRoot, file));
                configFiles.push(file);
            } catch {}
        }
        result.configFiles = configFiles;

    } catch (error) {
        // Error reading package.json -> Not a supported project
        result.isProject = false;
    }

    return result;
};
