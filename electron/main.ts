import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import path from "path";
import { spawn } from "child_process";

import * as dotenv from 'dotenv';
import os from 'os';

// Explicitly load .env from the project root or resources
const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../.env');

dotenv.config({ path: envPath });

// Security: Validate paths are within allowed directories
const isPathAllowed = (targetPath: string): boolean => {
    const home = os.homedir();
    const resolved = path.resolve(targetPath);
    // Allow paths within home directory only
    return resolved.startsWith(home);
};

// Set the app name for macOS menu bar
app.setName('API Visualization');
// Restoration of standard menu for keyboard shortcuts
import { Menu, MenuItemConstructorOptions } from 'electron';

const template: MenuItemConstructorOptions[] = [
  ...(process.platform === 'darwin' ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] as MenuItemConstructorOptions[] : []),
  {
    label: 'File',
    submenu: [
      { role: 'close' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(process.platform === 'darwin' ? [
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ] : [
        { role: 'close' }
      ])
    ] as MenuItemConstructorOptions[]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged && process.argv.includes('--dev');

let apiPort: number = 3001;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    // Development mode - use Next.js dev server
    win.loadURL(`http://localhost:3000`);
    win.webContents.openDevTools();
    win.webContents.on("did-fail-load", (e, code, desc) => {
      win.webContents.reloadIgnoringCache();
    });
  } else {
    // Production mode - use static export
    (async () => {
      const serve = (await import("electron-serve")).default;
      const appServe = serve({ directory: path.join(__dirname, "../out") });
      appServe(win).then(() => {
        win.loadURL("app://-");
      });
    })();
  }
};

app.on("ready", async () => {
  // Local server removed.
  console.log("Electron ready");

  // Get Desktop path
  ipcMain.handle('get-desktop-path', () => {
      const os = require('os');
      const path = require('path');
      return path.join(os.homedir(), 'Desktop');
  });

  ipcMain.handle('open-path', async (event, targetPath: string, line?: number, appName?: 'antigravity' | 'vscode' | 'cursor' | 'system') => {
      if (!isPathAllowed(targetPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      // Helper to open specific editor
      const openInEditor = (cmd: string[]) => {
          try {
             const fs = require('fs');
             const name = cmd[0];
             
             // Check common locations
             const commonPaths = [
                 `/usr/local/bin/${name}`, 
                 `/opt/homebrew/bin/${name}`, 
                 `/usr/bin/${name}`,
                 // Add Cursor specific paths if known, usually just 'cursor' linked
             ];
             
             let fullPath = null;
             for (const p of commonPaths) {
                 if (fs.existsSync(p)) { fullPath = p; break; }
             }
             
             if (fullPath) {
                 spawn(fullPath, cmd.slice(1).concat(['-g', `${targetPath}:${line || 1}`]), { detached: true, stdio: 'ignore' });
                 return true;
             }
             return false;
          } catch(e) { return false; }
      };

      if (appName === 'vscode') {
          if (openInEditor(['code'])) return { success: true };
          // Fallback to macOS open if linux path check fails
          if (process.platform === 'darwin') {
              spawn('open', ['-a', 'Visual Studio Code', '--args', '-g', `${targetPath}:${line || 1}`]);
              return { success: true };
          }
      }
      
      if (appName === 'cursor') {
          if (openInEditor(['cursor'])) return { success: true };
          // Fallback
           if (process.platform === 'darwin') {
              spawn('open', ['-a', 'Cursor', '--args', '-g', `${targetPath}:${line || 1}`]);
              return { success: true };
          }
      }

      if (appName === 'antigravity') {
          if (openInEditor(['antigravity'])) return { success: true };
          // Fallback for macOS if installed as an app bundle
           if (process.platform === 'darwin') {
              spawn('open', ['-a', 'Antigravity', '--args', '-g', `${targetPath}:${line || 1}`]);
              return { success: true };
          }
      }

      // Auto-detection logic (if appName not specified but line provided)
      if (line !== undefined && line !== null && !appName) {
          // Default priority: Antigravity -> Cursor -> VS Code -> System
          if (openInEditor(['antigravity'])) return { success: true };
          if (openInEditor(['cursor'])) return { success: true };
          if (openInEditor(['code'])) return { success: true };
          
           if (process.platform === 'darwin') {
               // Try opening Antigravity widely
               spawn('open', ['-a', 'Antigravity', '--args', '-g', `${targetPath}:${line}`]);
           }
           // Proceed to fallback
      }

      // Default fallback (System Default)
      return await shell.openPath(targetPath);
  });

  ipcMain.handle('show-item-in-folder', async (event, targetPath: string) => {
      if (!isPathAllowed(targetPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      return shell.showItemInFolder(targetPath);
  });

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
              // Fallback for unsupported formats or platforms
              // console.warn('Thumbnail generation failed, falling back to full read:', e);
              const img = nativeImage.createFromPath(filePath);
              if (img.isEmpty()) return null;
              return img.resize({ width: 256 }).toDataURL();
          }
      } catch (err) {
          console.error('Failed to read image:', err);
          return null;
      }
  });

  // Direct filesystem listing from renderer
  ipcMain.handle('list-files', async (event, args: { path: string; extensions?: string[] }) => {
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
      } catch (err: any) {
          console.error('Failed to list files:', err);
          return { success: false, error: err.message };
      }
  });



  // Calculate folder size
  // Calculate folder size (Worker Thread)
  ipcMain.handle('get-folder-size', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else resolve(0);
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              resolve(0);
              worker.terminate();
          });
          worker.postMessage({ type: 'size', payload: { path: folderPath } });
      });
  });

  // Get Directory Stats (Worker Thread)
  ipcMain.handle('get-directory-stats', async (event, folderPath: string) => {
      if (!isPathAllowed(folderPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }
      // Re-use worker logic (refactor if repeated often)
      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else {
                  console.error('Stats worker error:', msg.error);
                  resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
              }
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              console.error('Stats worker unexpected error:', err);
              resolve({ totalSize: 0, fileCount: 0, folderCount: 0, types: {} });
              worker.terminate(); 
          });
          worker.postMessage({ type: 'stats', payload: { path: folderPath } });
      });
  });

  // Search Content (Worker Thread)
  ipcMain.handle('search-content', async (event, args: { directory: string; query: string; extensions?: string[] }) => {
      if (!isPathAllowed(args.directory)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          
          // Worker path depends on environment, but since we compile everything to 'dist',
          // it should be relative to this file (main.js)
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          
          const worker = new Worker(workerPath);

          worker.on('message', (msg: any) => {
              if (msg.type === 'success') {
                  resolve(msg.results);
              } else {
                  console.error('Worker error:', msg.error);
                  resolve({ matches: [], totalMatches: 0, searchedFiles: 0 }); // Fail gracefully
              }
              worker.terminate();
          });

          worker.on('error', (err: Error) => {
              console.error('Worker thread error:', err);
              reject(err);
              worker.terminate();
          });

          worker.on('exit', (code: number) => {
              if (code !== 0) {
                  console.error(new Error(`Worker stopped with exit code ${code}`));
              }
          });

          // Send task
          worker.postMessage({ type: 'search', payload: args });
      });
  });

  // Analyze Dependencies (Worker Thread)
  ipcMain.handle('analyze-dependencies', async (event, rootPath: string) => {
      if (!isPathAllowed(rootPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else {
                  console.error('Deps worker error:', msg.error);
                  resolve({ nodes: [], edges: [] });
              }
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              console.error('Deps worker unexpected error:', err);
              resolve({ nodes: [], edges: [] });
              worker.terminate(); 
          });
          worker.postMessage({ type: 'deps', payload: { path: rootPath } });
      });
  });

  // Analyze API Endpoints (AST-based)
  ipcMain.handle('analyze-api-endpoints', async (event, rootPath: string) => {
      if (!isPathAllowed(rootPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      try {
          const { analyzeProject } = require('./tools/lib/analyzers');
          const endpoints = await analyzeProject(rootPath);
          return { success: true, endpoints };
      } catch (error: any) {
          console.error('API analysis error:', error);
          return { success: false, error: error.message, endpoints: [] };
      }
  });

  // Detect Project (Worker Thread)
  ipcMain.handle('detect-project', async (event, rootPath: string) => {
      if (!isPathAllowed(rootPath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else {
                  console.error('Project detection error:', msg.error);
                  resolve({ type: 'unknown', isProject: false }); // Fallback
              }
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              console.error('Project detection unexpected error:', err);
              resolve({ type: 'unknown', isProject: false });
              worker.terminate();
          });
          worker.postMessage({ type: 'detect-project', payload: { path: rootPath } });
      });
  });

  // Analyze Route Schema (Worker Thread)
  ipcMain.handle('analyze-route', async (event, filePath: string) => {
      if (!isPathAllowed(filePath)) {
          throw new Error('Access denied: Path outside allowed directory');
      }

      return new Promise((resolve, reject) => {
          const { Worker } = require('worker_threads');
          const workerPath = path.join(__dirname, 'tools/searchWorker.js');
          const worker = new Worker(workerPath);
          
          worker.on('message', (msg: any) => {
              if (msg.type === 'success') resolve(msg.results);
              else {
                  console.error('Route analysis error:', msg.error);
                  resolve({ routes: [], errors: [msg.error] });
              }
              worker.terminate();
          });
          worker.on('error', (err: any) => {
              console.error('Route analysis unexpected error:', err);
              resolve({ routes: [], errors: [err.message] });
              worker.terminate();
          });
          worker.postMessage({ type: 'analyze-route', payload: { path: filePath } });
      });
  });

  // File Watcher
  let currentWatcher: any = null;
  const chokidar = require('chokidar');

  ipcMain.handle('watch-directory', async (event, targetPath: string) => {
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
              depth: 1, // Only watch immediate directory for performance, or 0? 1 includes children.
              ignoreInitial: true, // Don't emit add events for existing files on startup
              awaitWriteFinish: { // Wait for writes to finish to avoid duplicate events
                  stabilityThreshold: 100,
                  pollInterval: 100
              }
          });

          // Send events
          const notifyChange = (path: string) => {
              // Debounced notification could be better, but for now simple relay
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

  
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
