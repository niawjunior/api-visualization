"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
const os_1 = __importDefault(require("os"));
// Explicitly load .env from the project root or resources
const envPath = electron_1.app.isPackaged
    ? path_1.default.join(process.resourcesPath, '.env')
    : path_1.default.join(__dirname, '../.env');
dotenv.config({ path: envPath });
// Security: Validate paths are within allowed directories
const isPathAllowed = (targetPath) => {
    const home = os_1.default.homedir();
    const resolved = path_1.default.resolve(targetPath);
    // Allow paths within home directory only
    return resolved.startsWith(home);
};
// Set the app name for macOS menu bar
electron_1.app.setName('API Visualization');
// Performance: Disable default menu (article recommendation #8)
const electron_2 = require("electron");
electron_2.Menu.setApplicationMenu(null);
// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged && process.argv.includes('--dev');
let apiPort = 3001;
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 18, y: 18 },
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
        },
    });
    if (isDev) {
        // Development mode - use Next.js dev server
        win.loadURL(`http://localhost:3000`);
        win.webContents.openDevTools();
        win.webContents.on("did-fail-load", (e, code, desc) => {
            win.webContents.reloadIgnoringCache();
        });
    }
    else {
        // Production mode - use static export
        (async () => {
            const serve = (await Promise.resolve().then(() => __importStar(require("electron-serve")))).default;
            const appServe = serve({ directory: path_1.default.join(__dirname, "../out") });
            appServe(win).then(() => {
                win.loadURL("app://-");
            });
        })();
    }
};
electron_1.app.on("ready", async () => {
    // Local server removed.
    console.log("Electron ready");
    // Get Desktop path
    electron_1.ipcMain.handle('get-desktop-path', () => {
        const os = require('os');
        const path = require('path');
        return path.join(os.homedir(), 'Desktop');
    });
    electron_1.ipcMain.handle('open-path', async (event, targetPath) => {
        if (!isPathAllowed(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return await electron_1.shell.openPath(targetPath);
    });
    electron_1.ipcMain.handle('show-item-in-folder', async (event, targetPath) => {
        if (!isPathAllowed(targetPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return electron_1.shell.showItemInFolder(targetPath);
    });
    electron_1.ipcMain.handle('read-text-file', async (event, filePath) => {
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
        }
        catch (err) {
            console.error('Failed to read text file:', err);
            return 'Failed to read file content.';
        }
    });
    electron_1.ipcMain.handle('read-image-as-base64', async (event, filePath) => {
        if (!isPathAllowed(filePath)) {
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
                // Fallback for unsupported formats or platforms
                // console.warn('Thumbnail generation failed, falling back to full read:', e);
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
    // Direct filesystem listing from renderer
    electron_1.ipcMain.handle('list-files', async (event, args) => {
        if (!isPathAllowed(args.path)) {
            return { success: false, error: 'Access denied: Path outside allowed directory' };
        }
        const { fsTools } = require('./tools/fs');
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
    // Calculate folder size
    // Calculate folder size (Worker Thread)
    electron_1.ipcMain.handle('get-folder-size', async (event, folderPath) => {
        if (!isPathAllowed(folderPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success')
                    resolve(msg.results);
                else
                    resolve(0);
                worker.terminate();
            });
            worker.on('error', (err) => {
                resolve(0);
                worker.terminate();
            });
            worker.postMessage({ type: 'size', payload: { path: folderPath } });
        });
    });
    // Get Directory Stats (Worker Thread)
    electron_1.ipcMain.handle('get-directory-stats', async (event, folderPath) => {
        if (!isPathAllowed(folderPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        // Re-use worker logic (refactor if repeated often)
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success')
                    resolve(msg.results);
                else {
                    console.error('Stats worker error:', msg.error);
                    resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
                }
                worker.terminate();
            });
            worker.on('error', (err) => {
                console.error('Stats worker unexpected error:', err);
                resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
                worker.terminate();
            });
            worker.postMessage({ type: 'stats', payload: { path: folderPath } });
        });
    });
    // Search Content (Worker Thread)
    electron_1.ipcMain.handle('search-content', async (event, args) => {
        if (!isPathAllowed(args.directory)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            // Worker path depends on environment, but since we compile everything to 'dist',
            // it should be relative to this file (main.js)
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success') {
                    resolve(msg.results);
                }
                else {
                    console.error('Worker error:', msg.error);
                    resolve({ matches: [], totalMatches: 0, searchedFiles: 0 }); // Fail gracefully
                }
                worker.terminate();
            });
            worker.on('error', (err) => {
                console.error('Worker thread error:', err);
                reject(err);
                worker.terminate();
            });
            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(new Error(`Worker stopped with exit code ${code}`));
                }
            });
            // Send task
            worker.postMessage({ type: 'search', payload: args });
        });
    });
    // Analyze Dependencies (Worker Thread)
    electron_1.ipcMain.handle('analyze-dependencies', async (event, rootPath) => {
        if (!isPathAllowed(rootPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success')
                    resolve(msg.results);
                else {
                    console.error('Deps worker error:', msg.error);
                    resolve({ nodes: [], edges: [] });
                }
                worker.terminate();
            });
            worker.on('error', (err) => {
                console.error('Deps worker unexpected error:', err);
                resolve({ nodes: [], edges: [] });
                worker.terminate();
            });
            worker.postMessage({ type: 'deps', payload: { path: rootPath } });
        });
    });
    // Analyze API Endpoints (AST-based)
    electron_1.ipcMain.handle('analyze-api-endpoints', async (event, rootPath) => {
        if (!isPathAllowed(rootPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        try {
            const { analyzeApiEndpoints } = require('./tools/lib/analyzers/nextjs');
            const endpoints = await analyzeApiEndpoints(rootPath);
            return { success: true, endpoints };
        }
        catch (error) {
            console.error('API analysis error:', error);
            return { success: false, error: error.message, endpoints: [] };
        }
    });
    // Detect Project (Worker Thread)
    electron_1.ipcMain.handle('detect-project', async (event, rootPath) => {
        if (!isPathAllowed(rootPath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success')
                    resolve(msg.results);
                else {
                    console.error('Project detection error:', msg.error);
                    resolve({ type: 'unknown', isProject: false }); // Fallback
                }
                worker.terminate();
            });
            worker.on('error', (err) => {
                console.error('Project detection unexpected error:', err);
                resolve({ type: 'unknown', isProject: false });
                worker.terminate();
            });
            worker.postMessage({ type: 'detect-project', payload: { path: rootPath } });
        });
    });
    // Analyze Route Schema (Worker Thread)
    electron_1.ipcMain.handle('analyze-route', async (event, filePath) => {
        if (!isPathAllowed(filePath)) {
            throw new Error('Access denied: Path outside allowed directory');
        }
        return new Promise((resolve, reject) => {
            const { Worker } = require('worker_threads');
            const workerPath = path_1.default.join(__dirname, 'tools/searchWorker.js');
            const worker = new Worker(workerPath);
            worker.on('message', (msg) => {
                if (msg.type === 'success')
                    resolve(msg.results);
                else {
                    console.error('Route analysis error:', msg.error);
                    resolve({ routes: [], errors: [msg.error] });
                }
                worker.terminate();
            });
            worker.on('error', (err) => {
                console.error('Route analysis unexpected error:', err);
                resolve({ routes: [], errors: [err.message] });
                worker.terminate();
            });
            worker.postMessage({ type: 'analyze-route', payload: { path: filePath } });
        });
    });
    // File Watcher
    let currentWatcher = null;
    const chokidar = require('chokidar');
    electron_1.ipcMain.handle('watch-directory', async (event, targetPath) => {
        // Clean up previous watcher
        if (currentWatcher) {
            try {
                await currentWatcher.close();
            }
            catch (e) { }
            currentWatcher = null;
        }
        if (!isPathAllowed(targetPath))
            return { success: false, error: 'Access denied' };
        try {
            // Watch for changes using Chokidar for robustness
            currentWatcher = chokidar.watch(targetPath, {
                ignored: [/(^|[\/\\])\../, '**/node_modules/**'], // Ignore dotfiles and node_modules
                persistent: true,
                depth: 1, // Only watch immediate directory for performance, or 0? 1 includes children.
                ignoreInitial: true, // Don't emit add events for existing files on startup
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 100
                }
            });
            // Send events
            const notifyChange = (path) => {
                // Debounced notification could be better, but for now simple relay
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
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
