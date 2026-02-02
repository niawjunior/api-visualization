"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pythonFrameworkAnalyzer = exports.analyzePythonDependencies = exports.pythonFileDependencyAnalyzer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const analyzer_1 = require("./analyzer");
var file_dep_analyzer_1 = require("./file-dep-analyzer");
Object.defineProperty(exports, "pythonFileDependencyAnalyzer", { enumerable: true, get: function () { return file_dep_analyzer_1.pythonFileDependencyAnalyzer; } });
var deps_runner_1 = require("./deps-runner");
Object.defineProperty(exports, "analyzePythonDependencies", { enumerable: true, get: function () { return deps_runner_1.analyzePythonDependencies; } });
exports.pythonFrameworkAnalyzer = {
    name: 'python',
    detect: async (projectPath, config) => {
        // 1. Check for Python project indicators
        const hasPyProject = fs_1.default.existsSync(path_1.default.join(projectPath, 'pyproject.toml'));
        const hasRequirements = fs_1.default.existsSync(path_1.default.join(projectPath, 'requirements.txt'));
        const hasPipfile = fs_1.default.existsSync(path_1.default.join(projectPath, 'Pipfile'));
        const hasUvLock = fs_1.default.existsSync(path_1.default.join(projectPath, 'uv.lock')); // User has this
        const isPythonProject = hasPyProject || hasRequirements || hasPipfile || hasUvLock;
        if (!isPythonProject) {
            return false;
        }
        // 2. We could check content for 'fastapi' or 'django', but for now assume detection is enough.
        // User explicitly wants support for this project.
        return true;
    },
    analyze: async (projectPath, config) => {
        return (0, analyzer_1.analyzePythonEndpoints)(projectPath, config);
    }
};
