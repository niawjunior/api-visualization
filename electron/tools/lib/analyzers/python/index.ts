import { ApiAnalyzer } from '../core/analyzer';
import { ApiVizConfig } from '../core/config';
import fs from 'fs';
import path from 'path';
import { analyzePythonEndpoints } from './analyzer';

export { pythonFileDependencyAnalyzer } from './file-dep-analyzer';
export { analyzePythonDependencies } from './deps-runner';

export const pythonFrameworkAnalyzer: ApiAnalyzer = {
    name: 'python',
    detect: async (projectPath: string, config: ApiVizConfig): Promise<boolean> => {
        // 1. Check for Python project indicators
        const hasPyProject = fs.existsSync(path.join(projectPath, 'pyproject.toml'));
        const hasRequirements = fs.existsSync(path.join(projectPath, 'requirements.txt'));
        const hasPipfile = fs.existsSync(path.join(projectPath, 'Pipfile'));
        const hasUvLock = fs.existsSync(path.join(projectPath, 'uv.lock')); // User has this
        
        const isPythonProject = hasPyProject || hasRequirements || hasPipfile || hasUvLock;
        
        if (!isPythonProject) {
            return false;
        }

        // 2. We could check content for 'fastapi' or 'django', but for now assume detection is enough.
        // User explicitly wants support for this project.
        return true;
    },
    analyze: async (projectPath: string, config: ApiVizConfig) => {
        return analyzePythonEndpoints(projectPath, config);
    }
};
