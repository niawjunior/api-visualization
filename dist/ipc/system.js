"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSystemHandlers = registerSystemHandlers;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const guards_1 = require("./guards");
function registerSystemHandlers() {
    electron_1.ipcMain.handle('open-path', async (event, targetPath, line, appName) => {
        if (!(0, guards_1.isPathAllowed)(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        // Helper to open specific editor
        const openInEditor = (cmd) => {
            try {
                const fs = require('fs');
                const name = cmd[0];
                // Check common locations
                const commonPaths = [
                    `/usr/local/bin/${name}`,
                    `/opt/homebrew/bin/${name}`,
                    `/usr/bin/${name}`,
                ];
                let fullPath = null;
                for (const p of commonPaths) {
                    if (fs.existsSync(p)) {
                        fullPath = p;
                        break;
                    }
                }
                if (fullPath) {
                    (0, child_process_1.spawn)(fullPath, cmd.slice(1).concat(['-g', `${targetPath}:${line || 1}`]), { detached: true, stdio: 'ignore' });
                    return true;
                }
                return false;
            }
            catch (e) {
                return false;
            }
        };
        if (appName === 'vscode') {
            if (openInEditor(['code']))
                return { success: true };
            // Fallback to macOS open if linux path check fails
            if (process.platform === 'darwin') {
                (0, child_process_1.spawn)('open', ['-a', 'Visual Studio Code', '--args', '-g', `${targetPath}:${line || 1}`]);
                return { success: true };
            }
        }
        if (appName === 'cursor') {
            if (openInEditor(['cursor']))
                return { success: true };
            // Fallback
            if (process.platform === 'darwin') {
                (0, child_process_1.spawn)('open', ['-a', 'Cursor', '--args', '-g', `${targetPath}:${line || 1}`]);
                return { success: true };
            }
        }
        if (appName === 'antigravity') {
            if (openInEditor(['antigravity']))
                return { success: true };
            // Fallback for macOS if installed as an app bundle
            if (process.platform === 'darwin') {
                // Try simpler open command first which is more robust for Electron apps
                (0, child_process_1.spawn)('open', ['-a', 'Antigravity', targetPath]);
                return { success: true };
            }
        }
        // Auto-detection logic (if appName not specified but line provided)
        if (line !== undefined && line !== null && !appName) {
            // Default priority: Antigravity -> Cursor -> VS Code -> System
            if (openInEditor(['antigravity']))
                return { success: true };
            if (openInEditor(['cursor']))
                return { success: true };
            if (openInEditor(['code']))
                return { success: true };
            if (process.platform === 'darwin') {
                // Try opening Antigravity widely
                (0, child_process_1.spawn)('open', ['-a', 'Antigravity', '--args', '-g', `${targetPath}:${line}`]);
            }
            // Proceed to fallback
        }
        // Generic macOS Open Helper for other detected apps
        if (appName && appName !== 'system' && process.platform === 'darwin') {
            // For cases like 'Sublime Text', 'Xcode', etc.
            // VSCode/Cursor/Antigravity likely handled above, but if they failed those checks (e.g. CLI tool missing),
            // falling back to open -a is good.
            // We construct args. Most mac apps support file:line? No, standard open -a doesn't guarantee :line support.
            // VS Code and Cursor do. Others might just open the file.
            // Check if it is one of our special keys
            const nameToOpen = appName === 'vscode' ? 'Visual Studio Code' :
                appName === 'cursor' ? 'Cursor' :
                    appName;
            (0, child_process_1.spawn)('open', ['-a', nameToOpen, '--args', targetPath]); // Most apps don't support standardized line numbers via generic open
            return { success: true };
        }
        // Default fallback (System Default)
        return await electron_1.shell.openPath(targetPath);
    });
    // Smart Editor Detection
    electron_1.ipcMain.handle('get-available-editors', async () => {
        if (process.platform !== 'darwin')
            return [];
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const KNOWN_EDITORS = [
            { id: 'com.google.antigravity', name: 'Antigravity' },
            { id: 'com.microsoft.VSCode', name: 'VS Code' },
            { id: 'com.todesktop.230313mzl4w4u92', name: 'Cursor' },
            { id: 'dev.zed.Zed', name: 'Zed' },
            { id: 'com.sublimetext.4', name: 'Sublime Text' },
            { id: 'com.jetbrains.intellij', name: 'IntelliJ IDEA' },
            { id: 'com.jetbrains.webstorm', name: 'WebStorm' },
            { id: 'com.jetbrains.pycharm', name: 'PyCharm' },
            { id: 'com.apple.dt.Xcode', name: 'Xcode' },
        ];
        try {
            // Find all installed apps matching these IDs
            const query = KNOWN_EDITORS.map(e => `kMDItemCFBundleIdentifier == '${e.id}'`).join(' || ');
            const { stdout } = await execAsync(`mdfind "${query}"`);
            const paths = stdout.trim().split('\n').filter(Boolean);
            const foundEditors = [];
            for (const editorPath of paths) {
                for (const known of KNOWN_EDITORS) {
                    // Check if path matches expected app name loosely
                    if (editorPath.toLowerCase().includes(known.name.toLowerCase().replace(' ', ''))) {
                        // Determine key: keep 'vscode'/'cursor' for special handling, usage proper name for others
                        let key = known.name;
                        if (known.id === 'com.microsoft.VSCode')
                            key = 'vscode';
                        if (known.id === 'com.todesktop.230313mzl4w4u92')
                            key = 'cursor';
                        if (known.id === 'com.google.antigravity')
                            key = 'antigravity';
                        foundEditors.push({
                            name: known.name,
                            path: editorPath, // Store path in case we need it later
                            key: key
                        });
                    }
                }
            }
            // Remove duplicates
            const unique = new Map();
            foundEditors.forEach(e => unique.set(e.name, e));
            return Array.from(unique.values());
        }
        catch (e) {
            console.error('Failed to detect editors', e);
            return [];
        }
    });
}
