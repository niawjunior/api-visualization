"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePythonEndpoints = analyzePythonEndpoints;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
async function analyzePythonEndpoints(projectPath, config) {
    return new Promise((resolve, reject) => {
        // Use the actual script file
        // In dev: inside scripts folder. In prod: need to ensure it's unpacked or resolve correctly.
        // Assuming standard structure: ./scripts/scanner.py relative to this file
        // This file is in .../analyzers/python/analyzer.ts (compiled to .js)
        // script is in .../analyzers/python/scripts/scanner.py
        const scriptPath = path_1.default.join(__dirname, 'scripts', 'scanner.py');
        if (!fs_1.default.existsSync(scriptPath)) {
            console.error(`[PythonAnalyzer] Scanner script not found at: ${scriptPath}`);
            resolve([]);
            return;
        }
        // Ensure standard paths are included for GUI apps (Homebrew, etc.)
        const env = {
            ...process.env,
            PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
        };
        console.log(`[PythonAnalyzer] Spawning scanner: python3 ${scriptPath} ${projectPath}`);
        console.log(`[PythonAnalyzer] PATH: ${env.PATH}`);
        const pythonProcess = (0, child_process_1.spawn)('python3', [scriptPath, projectPath], { env });
        let stdoutData = '';
        let stderrData = '';
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });
        pythonProcess.on('close', (code) => {
            // No cleanup needed for existing script file
            if (code !== 0) {
                console.error(`[PythonAnalyzer] Scanner failed (code ${code}): ${stderrData}`);
                resolve([]);
                return;
            }
            try {
                // Determine which part of stdout is JSON. 
                const jsonStart = stdoutData.indexOf('[');
                const jsonEnd = stdoutData.lastIndexOf(']');
                if (jsonStart === -1 || jsonEnd === -1) {
                    console.error("[PythonAnalyzer] Invalid JSON output from scanner:", stdoutData);
                    if (stderrData)
                        console.error("[PythonAnalyzer] Stderr:", stderrData);
                    resolve([]);
                    return;
                }
                const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
                const rawRoutes = JSON.parse(jsonStr);
                const endpoints = mapToApiEndpoints(rawRoutes, projectPath);
                resolve(endpoints);
            }
            catch (e) {
                console.error("[PythonAnalyzer] Failed to parse Python scanner output:", e);
                console.error("Stdout was:", stdoutData);
                resolve([]);
            }
        });
        pythonProcess.on('error', (err) => {
            console.error("[PythonAnalyzer] Process error:", err);
            // Verify cleanup happened?
            try {
                if (fs_1.default.existsSync(scriptPath))
                    fs_1.default.unlinkSync(scriptPath);
            }
            catch { }
            resolve([]);
        });
    });
}
function mapToApiEndpoints(routes, projectPath) {
    const endpointMap = new Map();
    for (const route of routes) {
        // Normalize path
        let normalizedPath = route.full_path;
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        // Normalize method
        const method = route.method.toUpperCase();
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
        if (!validMethods.includes(method)) {
            continue;
        }
        const k = `${method}:${normalizedPath}`;
        // Use unique key per method+path to create separate cards for each method overloads
        const pathKey = k;
        if (endpointMap.has(pathKey)) {
            // Already handled this exact method+path combination?
            // Usually scanner returns unique lines. If duplicates exist, we might overwrite or ignore.
            // For now, let's just ignore duplicate definitions of exact same method+path.
        }
        else {
            const endpoint = {
                path: normalizedPath,
                methods: [method],
                params: [],
                queryParams: [],
                requestBody: route.request_schema?.map(f => ({
                    name: f.name,
                    type: f.type,
                    required: f.required,
                    optional: !f.required // Add missing property
                })) || [],
                responseBody: route.response_schema?.map(f => ({
                    name: f.name,
                    type: f.type,
                    required: f.required,
                    optional: !f.required // Add missing property
                })) || [],
                responses: [],
                dependencies: {
                    services: [],
                    database: [],
                    external: [],
                    utilities: [],
                    grouped: [],
                    tables: [],
                    apiCalls: []
                },
                filePath: path_1.default.join(projectPath, route.file_path),
                relativePath: route.file_path,
                lineNumber: route.lineno
            };
            // Extract route params (e.g. /users/{id})
            const paramMatches = normalizedPath.match(/\{([^}]+)\}/g);
            if (paramMatches) {
                endpoint.params = paramMatches.map(p => ({
                    name: p.slice(1, -1),
                    type: 'string', // Inferred
                    optional: false
                }));
            }
            endpointMap.set(pathKey, endpoint);
        }
    }
    // Convert map to array and sort
    const result = Array.from(endpointMap.values());
    result.sort((a, b) => a.path.localeCompare(b.path));
    return result;
}
