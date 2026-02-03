"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAnalysisHandlers = registerAnalysisHandlers;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const guards_1 = require("./guards");
// Helper to interact with worker
function runWorkerTask(type, payload) {
    return new Promise((resolve, reject) => {
        const { Worker } = require('worker_threads');
        // Point to the worker file. 
        // Note: We need to go up one level from 'ipc' to 'electron' (implied) then down to 'tools'.
        // Actually, __dirname in `dist/ipc` will need to find `dist/tools/searchWorker.js`.
        const workerPath = path_1.default.join(__dirname, '../tools/searchWorker.js');
        const worker = new Worker(workerPath);
        worker.on('message', (msg) => {
            if (msg.type === 'success')
                resolve(msg.results);
            else {
                console.error(`Worker error (${type}):`, msg.error);
                // Return safe defaults based on type
                if (type === 'stats' || type === 'size')
                    resolve(0);
                else if (type === 'search')
                    resolve({ matches: [], totalMatches: 0, searchedFiles: 0 });
                else if (type === 'deps')
                    resolve({ nodes: [], edges: [] });
                else if (type === 'detect-project')
                    resolve({ type: 'unknown', isProject: false });
                else if (type === 'analyze-route')
                    resolve({ routes: [], errors: [msg.error || 'Unknown error'] });
                else
                    resolve(null);
            }
            worker.terminate();
        });
        worker.on('error', (err) => {
            console.error(`Worker crash (${type}):`, err);
            // Return safe defaults
            if (type === 'stats' || type === 'size')
                resolve(0);
            else if (type === 'search')
                resolve({ matches: [], totalMatches: 0, searchedFiles: 0 });
            else if (type === 'deps')
                resolve({ nodes: [], edges: [] });
            else if (type === 'detect-project')
                resolve({ type: 'unknown', isProject: false });
            else if (type === 'analyze-route')
                resolve({ routes: [], errors: [err.message] });
            else
                resolve(null);
            worker.terminate();
        });
        worker.postMessage({ type, payload });
    });
}
function registerAnalysisHandlers() {
    // Calculate folder size
    electron_1.ipcMain.handle('get-folder-size', async (event, folderPath) => {
        if (!(0, guards_1.isPathAllowed)(folderPath))
            throw new Error('Access denied');
        return runWorkerTask('size', { path: folderPath });
    });
    // Get Directory Stats
    electron_1.ipcMain.handle('get-directory-stats', async (event, folderPath) => {
        if (!(0, guards_1.isPathAllowed)(folderPath))
            throw new Error('Access denied');
        return runWorkerTask('stats', { path: folderPath });
    });
    // Search Content
    electron_1.ipcMain.handle('search-content', async (event, args) => {
        if (!(0, guards_1.isPathAllowed)(args.directory))
            throw new Error('Access denied');
        return runWorkerTask('search', args);
    });
    // Analyze Dependencies
    electron_1.ipcMain.handle('analyze-dependencies', async (event, rootPath) => {
        if (!(0, guards_1.isPathAllowed)(rootPath))
            throw new Error('Access denied');
        return runWorkerTask('deps', { path: rootPath });
    });
    // Detect Project
    electron_1.ipcMain.handle('detect-project', async (event, rootPath) => {
        if (!(0, guards_1.isPathAllowed)(rootPath))
            throw new Error('Access denied');
        return runWorkerTask('detect-project', { path: rootPath });
    });
    // Analyze Route
    electron_1.ipcMain.handle('analyze-route', async (event, filePath) => {
        if (!(0, guards_1.isPathAllowed)(filePath))
            throw new Error('Access denied');
        return runWorkerTask('analyze-route', { path: filePath });
    });
    // Analyze API Endpoints (Direct call, not worker for now, as per original main.ts implementation)
    // Actually main.ts 419 used require('./tools/lib/analyzers').
    electron_1.ipcMain.handle('analyze-api-endpoints', async (event, rootPath) => {
        if (!(0, guards_1.isPathAllowed)(rootPath))
            throw new Error('Access denied');
        try {
            const { analyzeProject } = require('../tools/lib/analyzers');
            const endpoints = await analyzeProject(rootPath);
            return { success: true, endpoints };
        }
        catch (error) {
            console.error('API analysis error:', error);
            return { success: false, error: error.message, endpoints: [] };
        }
    });
}
