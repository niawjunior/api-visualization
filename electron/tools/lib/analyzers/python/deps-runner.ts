
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DependencyGraph } from '../types';

import { getPythonEnv } from '../../python-env';

export function analyzePythonDependencies(projectPath: string): Promise<DependencyGraph> {
    return new Promise((resolve, reject) => {
        const { pythonPath, cwd, env } = getPythonEnv();

        // Run python3 -m scanner <path> --deps
        const pythonProcess = spawn(pythonPath, ['-m', 'scanner', projectPath, '--deps'], {
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
                const graph: DependencyGraph = JSON.parse(jsonStr);
                
                // Debug logging removed for production
                if (graph.errors && graph.errors.length > 0) {
                     console.warn("[PythonDeps] Parsing errors occurred:", graph.errors);
                }

                resolve(graph);
            } catch (e) {
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
