import fs from 'fs/promises';
import path from 'path';
import { ProjectInfo, ProjectType } from './types';

export const detectProject = async (targetPath: string): Promise<ProjectInfo> => {
    const result: ProjectInfo = {
        path: targetPath,
        type: 'unknown',
        isProject: false
    };

    try {
        // 1. Check for package.json
        const packageJsonPath = path.join(targetPath, 'package.json');
        await fs.access(packageJsonPath);
        
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(packageContent);
        
        result.isProject = true;
        result.name = pkg.name;
        result.dependencies = Object.keys(pkg.dependencies || {});
        result.devDependencies = Object.keys(pkg.devDependencies || {});

        // 2. Identify Project Type
        const allDeps = [...(result.dependencies || []), ...(result.devDependencies || [])];

        if (allDeps.includes('next')) {
            result.type = 'nextjs';
        } else if (allDeps.includes('express') || allDeps.includes('nest') || result.isProject) {
            result.type = 'node'; // Generic Node project
        }

        // 3. Check for Config Files (Confirmation)
        const configFiles = [];
        const possibleConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'tsconfig.json', 'tailwind.config.ts', 'tailwind.config.js'];
        
        for (const file of possibleConfigs) {
             try {
                 await fs.access(path.join(targetPath, file));
                 configFiles.push(file);
             } catch {}
        }
        result.configFiles = configFiles;

    } catch (error) {
        // No package.json or error reading it -> Not a supported project root
        result.isProject = false;
    }

    return result;
};
