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
async function findProjectRoot(startPath) {
    let current = startPath;
    const root = path_1.default.parse(current).root;
    while (current !== root) {
        try {
            const packageJsonPath = path_1.default.join(current, 'package.json');
            await promises_1.default.access(packageJsonPath);
            return current; // Found package.json
        }
        catch {
            current = path_1.default.dirname(current);
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
        const projectRoot = await findProjectRoot(targetPath);
        if (!projectRoot) {
            // No package.json found anywhere up the tree
            return result;
        }
        // Update path to project root (important for dependency analysis)
        result.path = projectRoot;
        // 2. Read package.json from project root
        const packageJsonPath = path_1.default.join(projectRoot, 'package.json');
        const packageContent = await promises_1.default.readFile(packageJsonPath, 'utf-8');
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
        }
        else if (allDeps.includes('vite')) {
            result.type = 'vite';
        }
        else if (allDeps.includes('express') || allDeps.includes('nest') || allDeps.includes('fastify')) {
            result.type = 'node';
        }
        else if (result.isProject) {
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
                await promises_1.default.access(path_1.default.join(projectRoot, file));
                configFiles.push(file);
            }
            catch { }
        }
        result.configFiles = configFiles;
    }
    catch (error) {
        // Error reading package.json -> Not a supported project
        result.isProject = false;
    }
    return result;
};
exports.detectProject = detectProject;
