"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProject = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const detectProject = async (targetPath) => {
    const result = {
        path: targetPath,
        type: 'unknown',
        isProject: false
    };
    try {
        // 1. Check for package.json
        const packageJsonPath = path_1.default.join(targetPath, 'package.json');
        await promises_1.default.access(packageJsonPath);
        const packageContent = await promises_1.default.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(packageContent);
        result.isProject = true;
        result.name = pkg.name;
        result.dependencies = Object.keys(pkg.dependencies || {});
        result.devDependencies = Object.keys(pkg.devDependencies || {});
        // 2. Identify Project Type
        const allDeps = [...(result.dependencies || []), ...(result.devDependencies || [])];
        if (allDeps.includes('next')) {
            result.type = 'nextjs';
        }
        else if (allDeps.includes('express') || allDeps.includes('nest') || result.isProject) {
            result.type = 'node'; // Generic Node project
        }
        // 3. Check for Config Files (Confirmation)
        const configFiles = [];
        const possibleConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'tsconfig.json', 'tailwind.config.ts', 'tailwind.config.js'];
        for (const file of possibleConfigs) {
            try {
                await promises_1.default.access(path_1.default.join(targetPath, file));
                configFiles.push(file);
            }
            catch { }
        }
        result.configFiles = configFiles;
    }
    catch (error) {
        // No package.json or error reading it -> Not a supported project root
        result.isProject = false;
    }
    return result;
};
exports.detectProject = detectProject;
