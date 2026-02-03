"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFileSystemHandlers = registerFileSystemHandlers;
const electron_1 = require("electron");
const guards_1 = require("./guards");
const chokidar_1 = __importDefault(require("chokidar"));
function registerFileSystemHandlers() {
    // Get Desktop path
    electron_1.ipcMain.handle('get-desktop-path', () => {
        const os = require('os');
        const path = require('path');
        return path.join(os.homedir(), 'Desktop');
    });
    // Show item in folder
    electron_1.ipcMain.handle('show-item-in-folder', async (event, targetPath) => {
        if (!(0, guards_1.isPathAllowed)(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return electron_1.shell.showItemInFolder(targetPath);
    });
    // Read text file
    electron_1.ipcMain.handle('read-text-file', async (event, filePath) => {
        if (!(0, guards_1.isPathAllowed)(filePath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        const fs = require('fs').promises;
        try {
            // Limit file size to 1MB for preview
            const stats = await fs.stat(filePath);
            if (stats.size > 1024 * 1024) {
                return 'File too large to preview (>1MB)';
            }
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        }
        catch (err) {
            console.error('Failed to read text file:', err);
            return 'Failed to read file content.';
        }
    });
    // Read image as base64
    electron_1.ipcMain.handle('read-image-as-base64', async (event, filePath) => {
        if (!(0, guards_1.isPathAllowed)(filePath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        const { nativeImage } = require('electron');
        try {
            // Try optimized thumbnail generation first (macOS/Windows)
            try {
                const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 256, height: 256 });
                return thumb.toDataURL();
            }
            catch (e) {
                const img = nativeImage.createFromPath(filePath);
                if (img.isEmpty())
                    return null;
                return img.resize({ width: 256 }).toDataURL();
            }
        }
        catch (err) {
            console.error('Failed to read image:', err);
            return null;
        }
    });
    // List files
    electron_1.ipcMain.handle('list-files', async (event, args) => {
        if (!(0, guards_1.isPathAllowed)(args.path)) {
            return { success: false, error: 'Access denied: Path outside allowed directory' };
        }
        const { fsTools } = require('../tools/fs');
        try {
            const files = await fsTools.listFiles({
                path: args.path,
                extensions: args.extensions,
                sort: 'type' // Folders first, then files by name
            });
            return { success: true, files };
        }
        catch (err) {
            console.error('Failed to list files:', err);
            return { success: false, error: err.message };
        }
    });
    // File Watcher
    let currentWatcher = null;
    electron_1.ipcMain.handle('watch-directory', async (event, targetPath) => {
        // Clean up previous watcher
        if (currentWatcher) {
            try {
                await currentWatcher.close();
            }
            catch (e) { }
            currentWatcher = null;
        }
        if (!(0, guards_1.isPathAllowed)(targetPath))
            return { success: false, error: 'Access denied' };
        try {
            // Watch for changes using Chokidar for robustness
            currentWatcher = chokidar_1.default.watch(targetPath, {
                ignored: [/(^|[\/\\])\../, '**/node_modules/**'], // Ignore dotfiles and node_modules
                persistent: true,
                depth: 1,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 100
                }
            });
            // Send events
            const notifyChange = (path) => {
                try {
                    if (!event.sender.isDestroyed()) {
                        event.sender.send('directory-changed', targetPath);
                    }
                }
                catch (e) {
                    // Window might be closed
                }
            };
            currentWatcher
                .on('add', notifyChange)
                .on('change', notifyChange)
                .on('unlink', notifyChange)
                .on('addDir', notifyChange)
                .on('unlinkDir', notifyChange);
            return { success: true };
        }
        catch (err) {
            console.error('Watch error:', err);
            return { success: false, error: err.message };
        }
    });
}
