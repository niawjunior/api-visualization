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
                (0, child_process_1.spawn)('open', ['-a', 'Antigravity', '--args', '-g', `${targetPath}:${line || 1}`]);
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
        // Default fallback (System Default)
        return await electron_1.shell.openPath(targetPath);
    });
}
