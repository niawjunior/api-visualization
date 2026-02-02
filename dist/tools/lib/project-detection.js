"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProject = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
/**
 * Find project root by walking up the directory tree looking for package.json
 */
/**
 * Find project root by walking up the directory tree looking for project markers
 */
async function findProjectRoot(startPath) {
    let current = startPath;
    const root = path_1.default.parse(current).root;
    // Safety check for empty path
    if (!current || current === '.') {
        return null;
    }
    while (true) {
        try {
            // Check for Node.js
            try {
                await promises_1.default.access(path_1.default.join(current, 'package.json'));
                return { path: current, type: 'node' };
            }
            catch { }
            // Check for Python
            const pythonMarkers = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'uv.lock'];
            for (const marker of pythonMarkers) {
                try {
                    await promises_1.default.access(path_1.default.join(current, marker));
                    return { path: current, type: 'python' };
                }
                catch { }
            }
            if (current === root)
                break;
            current = path_1.default.dirname(current);
        }
        catch {
            break;
        }
    }
    return null; // No project root found
}
const detectProject = async (targetPath) => {
    const result = {
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
            const packageJsonPath = path_1.default.join(found.path, 'package.json');
            const packageContent = await promises_1.default.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(packageContent);
            result.name = pkg.name;
            result.version = pkg.version;
            result.dependencies = Object.keys(pkg.dependencies || {});
            result.devDependencies = Object.keys(pkg.devDependencies || {});
            // 3. Identify Node Framework
            const allDeps = [...(result.dependencies || []), ...(result.devDependencies || [])];
            if (allDeps.includes('next')) {
                result.type = 'nextjs';
            }
            else if (allDeps.includes('vite')) {
                result.type = 'vite';
            }
            else if (allDeps.includes('express') || allDeps.includes('nest') || allDeps.includes('fastify')) {
                result.type = 'node';
            }
            else {
                result.type = 'node'; // Generic Node project
            }
            // 4. Check for Config Files (Confirmation)
            const configFiles = [];
            const possibleConfigs = [
                'next.config.js', 'next.config.mjs', 'next.config.ts',
                'vite.config.js', 'vite.config.ts',
                'tsconfig.json',
                'tailwind.config.ts', 'tailwind.config.js'
            ];
            for (const file of possibleConfigs) {
                try {
                    await promises_1.default.access(path_1.default.join(found.path, file));
                    configFiles.push(file);
                }
                catch { }
            }
            result.configFiles = configFiles;
        }
        else if (found.type === 'python') {
            result.type = 'python';
            // Try to read name from pyproject.toml if simple regex match? 
            // For now just basic detection is enough to enable the UI tabs.
            result.name = path_1.default.basename(found.path);
        }
    }
    catch (error) {
        // Error reading files -> Not a supported project or permission error
        console.error('Project detection error:', error);
        result.isProject = false;
    }
    return result;
};
exports.detectProject = detectProject;
