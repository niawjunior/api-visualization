import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from "electron";
import path from "path";
import * as dotenv from 'dotenv';

// IPC Handlers
import { registerFileSystemHandlers } from './ipc/filesystem';
import { registerSystemHandlers } from './ipc/system';
import { registerAnalysisHandlers } from './ipc/analysis';

// Explicitly load .env from the project root or resources
const envPath = app.isPackaged 
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '../.env');

dotenv.config({ path: envPath });

// Set the app name for macOS menu bar
app.setName('Duke');

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

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
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
  console.log("Electron ready");

  // Register IPC Handlers
  registerFileSystemHandlers();
  registerSystemHandlers();
  registerAnalysisHandlers();
  
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
