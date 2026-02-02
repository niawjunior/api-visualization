"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePythonDependencies = analyzePythonDependencies;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function analyzePythonDependencies(projectPath) {
    return new Promise((resolve, reject) => {
        // Validation: Verify scanner package exists
        const scannerDir = path_1.default.join(__dirname, 'scanner');
        if (!fs_1.default.existsSync(scannerDir)) {
            console.error(`[PythonDeps] Scanner package not found at: ${scannerDir}`);
            resolve({ nodes: [], edges: [] });
            return;
        }
        const env = {
            ...process.env,
            PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
        };
        // Run python3 -m scanner <path> --deps
        const pythonProcess = (0, child_process_1.spawn)('python3', ['-m', 'scanner', projectPath, '--deps'], {
            env,
            cwd: __dirname // Directory containing 'scanner' folder
        });
        let stdoutData = '';
        let stderrData = '';
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[PythonDeps] Failed (code ${code}): ${stderrData}`);
                resolve({ nodes: [], edges: [] });
                return;
            }
            try {
                // Find JSON
                const jsonStart = stdoutData.indexOf('{');
                const jsonEnd = stdoutData.lastIndexOf('}');
                if (jsonStart === -1 || jsonEnd === -1) {
                    console.warn('[PythonDeps] No JSON output found');
                    resolve({ nodes: [], edges: [] });
                    return;
                }
                const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
                const graph = JSON.parse(jsonStr);
                resolve(graph);
            }
            catch (e) {
                console.error("[PythonDeps] JSON Parse Error:", e);
                // Log partial output for debugging
                console.debug("[PythonDeps] Raw Output:", stdoutData.substring(0, 200) + "...");
                resolve({ nodes: [], edges: [] });
            }
        });
        pythonProcess.on('error', (err) => {
            console.error('[PythonDeps] Process Spawn Error:', err);
            resolve({ nodes: [], edges: [] });
        });
    });
}
