import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ApiEndpoint, HttpMethod } from '../core/api-types';
import { ApiVizConfig } from '../core/config';
// REMOVED: import { SCANNER_SCRIPT } from './script';

// Define the shape of scanner.py output
interface PythonSchemaField {
    name: string;
    type: string;
    required: boolean;
}

// Define the shape of scanner.py output
interface PythonRoute {
    path: string;
    method: string;
    router_var: string;
    lineno: number;
    file_path: string;
    full_path: string;
    function_name?: string;
    request_schema: PythonSchemaField[];
    response_schema: PythonSchemaField[];
    dependencies?: {
        services: any[];
        database: any[];
        external: any[];
        utilities: any[];
        grouped: any[];
        tables: string[];
        apiCalls: string[];
    };
}

export async function analyzePythonEndpoints(
    projectPath: string,
    config?: ApiVizConfig
): Promise<ApiEndpoint[]> {
    return new Promise((resolve, reject) => {
        const { getPythonEnv } = require('../../python-env');
        const { pythonPath, cwd, env } = getPythonEnv();

        console.log(`[PythonAnalyzer] Spawning scanner: ${pythonPath} -m scanner ${projectPath}`);
        
        const pythonProcess = spawn(pythonPath, ['-m', 'scanner', projectPath], { 
            env,
            cwd
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
                    if (stderrData) console.error("[PythonAnalyzer] Stderr:", stderrData);
                    resolve([]);
                    return;
                }
                
                const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
                const rawRoutes: PythonRoute[] = JSON.parse(jsonStr);
                const endpoints = mapToApiEndpoints(rawRoutes, projectPath);
                
                // Clean up debug logs - keep errors
                if (endpoints.length === 0 && rawRoutes.length > 0) {
                     console.warn(`[PythonAnalyzer] Warning: Routes parsed (${rawRoutes.length}) but 0 endpoints mapped.`);
                }

                resolve(endpoints);
                
            } catch (e: any) {
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

function mapToApiEndpoints(routes: PythonRoute[], projectPath: string): ApiEndpoint[] {
    const endpointMap = new Map<string, ApiEndpoint>();
    
    for (const route of routes) {
        // Determine correct file path and relative path
        let filePath = route.file_path;
        let relativePath = route.file_path;

        if (path.isAbsolute(route.file_path)) {
            filePath = route.file_path;
            relativePath = path.relative(projectPath, route.file_path);
        } else {
            filePath = path.join(projectPath, route.file_path);
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
        } else {
            const endpoint: ApiEndpoint = {
                path: normalizedPath,
                methods: [method as HttpMethod],
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
                lineNumber: route.lineno,
                functionName: route.function_name
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
