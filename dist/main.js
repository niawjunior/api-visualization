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
// IPC Handlers
const filesystem_1 = require("./ipc/filesystem");
const system_1 = require("./ipc/system");
const analysis_1 = require("./ipc/analysis");
// Explicitly load .env from the project root or resources
const envPath = electron_1.app.isPackaged
    ? path_1.default.join(process.resourcesPath, '.env')
    : path_1.default.join(__dirname, '../.env');
dotenv.config({ path: envPath });
// Set the app name for macOS menu bar
electron_1.app.setName('API Visualization');
const template = [
    ...(process.platform === 'darwin' ? [{
            label: electron_1.app.name,
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
        }] : []),
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
        ]
    }
];
const menu = electron_1.Menu.buildFromTemplate(template);
electron_1.Menu.setApplicationMenu(menu);
// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged && process.argv.includes('--dev');
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
    console.log("Electron ready");
    // Register IPC Handlers
    (0, filesystem_1.registerFileSystemHandlers)();
    (0, system_1.registerSystemHandlers)();
    (0, analysis_1.registerAnalysisHandlers)();
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
