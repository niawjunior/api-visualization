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
        // We now have a 'scanner' package directory at `.../analyzers/python/scanner`
        // We want to run `python3 -m scanner <path>` but we need to set PYTHONPATH to the parent dir of 'scanner'
        const scannerPackageDir = path_1.default.join(__dirname, 'scanner');
        const parentDir = path_1.default.dirname(scannerPackageDir);
        // OR simply run the __main__.py directly? 
        // python3 electron/tools/lib/analyzers/python/scanner/__main__.py <path>
        // But doing `python3 -m scanner` is cleaner if we set PYTHONPATH.
        // Let's rely on running __main__.py directly for simplicity in spawning, 
        // BUT we must set PYTHONPATH so imports like `from .core import ...` work? 
        // Actually, relative imports in __main__ require -m execution.
        // Correct approach: `python3 -m scanner <projectPath>`
        // CWD should be the parent directory: `electron/tools/lib/analyzers/python`
        const analyzersDir = path_1.default.join(__dirname);
        // We expect `scanner` folder to be in `analyzersDir`.
        // Check for scanner directory existence
        const mainScannerPath = path_1.default.join(analyzersDir, 'scanner', '__main__.py');
        if (!fs_1.default.existsSync(mainScannerPath)) {
            console.error(`[PythonAnalyzer] Scanner package not found at: ${mainScannerPath}`);
            resolve([]);
            return;
        }
        // Ensure standard paths are included for GUI apps (Homebrew, etc.)
        const env = {
            ...process.env,
            PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
        };
        console.log(`[PythonAnalyzer] Spawning scanner: python3 -m scanner ${projectPath}`);
        const pythonProcess = (0, child_process_1.spawn)('python3', ['-m', 'scanner', projectPath], {
            env,
            cwd: analyzersDir // Execute from the folder containing 'scanner' package
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
                // Clean up debug logs - keep errors
                if (endpoints.length === 0 && rawRoutes.length > 0) {
                    console.warn(`[PythonAnalyzer] Warning: Routes parsed (${rawRoutes.length}) but 0 endpoints mapped.`);
                }
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
            resolve([]);
        });
    });
}
function mapToApiEndpoints(routes, projectPath) {
    const endpointMap = new Map();
    for (const route of routes) {
        // Determine correct file path and relative path
        let filePath = route.file_path;
        let relativePath = route.file_path;
        if (path_1.default.isAbsolute(route.file_path)) {
            filePath = route.file_path;
            relativePath = path_1.default.relative(projectPath, route.file_path);
        }
        else {
            filePath = path_1.default.join(projectPath, route.file_path);
            relativePath = route.file_path; // Assuming it comes relative
        }
        // Normalize path
        let normalizedPath = route.full_path;
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        // Normalize method
        if (!route.method) {
            continue;
        }
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
                    optional: !f.required
                })) || [],
                responseBody: route.response_schema?.map(f => ({
                    name: f.name,
                    type: f.type,
                    required: f.required,
                    optional: !f.required,
                })) || [],
                responses: [], // Python scanner doesn't parse response codes deeply usage yet
                dependencies: route.dependencies ? {
                    services: route.dependencies.services || [],
                    database: route.dependencies.database || [],
                    external: route.dependencies.external || [],
                    utilities: route.dependencies.utilities || [],
                    grouped: route.dependencies.grouped || [],
                    tables: route.dependencies.tables || [],
                    apiCalls: route.dependencies.apiCalls || []
                } : {
                    services: [],
                    database: [],
                    external: [],
                    utilities: [],
                    grouped: [],
                    tables: [],
                    apiCalls: []
                },
                filePath: filePath,
                relativePath: relativePath,
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
