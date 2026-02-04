import { ipcMain, shell, IpcMainInvokeEvent } from 'electron';
import { isPathAllowed } from './guards';
import chokidar from 'chokidar';

export function registerFileSystemHandlers() {
    // Get Desktop path
    ipcMain.handle('get-desktop-path', () => {
        const os = require('os');
        const path = require('path');
        return path.join(os.homedir(), 'Desktop');
    });

    // Open Directory Dialog (for "Open Project" button)
    ipcMain.handle('select-directory', async () => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Open Project Folder'
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    // Show item in folder
    ipcMain.handle('show-item-in-folder', async (event, targetPath: string) => {
        if (!isPathAllowed(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return shell.showItemInFolder(targetPath);
    });

    // Read text file
    ipcMain.handle('read-text-file', async (event, filePath: string) => {
        if (!isPathAllowed(filePath)) {
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
        } catch (err) {
            console.error('Failed to read text file:', err);
            return 'Failed to read file content.';
        }
    });

    // Read image as base64
    ipcMain.handle('read-image-as-base64', async (event, filePath: string) => {
        if (!isPathAllowed(filePath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        const { nativeImage } = require('electron');
        try {
            // Try optimized thumbnail generation first (macOS/Windows)
            try {
                const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 256, height: 256 });
                return thumb.toDataURL();
            } catch (e) {
                const img = nativeImage.createFromPath(filePath);
                if (img.isEmpty()) return null;
                return img.resize({ width: 256 }).toDataURL();
            }
        } catch (err) {
            console.error('Failed to read image:', err);
            return null;
        }
    });

    // List files
    ipcMain.handle('list-files', async (event, args: { path: string; extensions?: string[] }) => {
        if (!isPathAllowed(args.path)) {
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
        } catch (err: any) {
            console.error('Failed to list files:', err);
            return { success: false, error: err.message };
        }
    });

    // File Watcher
    let currentWatcher: any = null;

    ipcMain.handle('watch-directory', async (event: IpcMainInvokeEvent, targetPath: string) => {
        // Clean up previous watcher
        if (currentWatcher) {
            try {
                await currentWatcher.close();
            } catch(e) {}
            currentWatcher = null;
        }

        if (!isPathAllowed(targetPath)) return { success: false, error: 'Access denied' };

        try {
            // Watch for changes using Chokidar for robustness
            currentWatcher = chokidar.watch(targetPath, {
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
            const notifyChange = (path: string) => {
                try {
                    if (!event.sender.isDestroyed()) {
                       event.sender.send('directory-changed', targetPath);
                    }
                } catch (e) {
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
        } catch (err: any) {
            console.error('Watch error:', err);
            return { success: false, error: err.message };
        }
    });
}
