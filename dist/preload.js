const { contextBridge, ipcRenderer, webUtils } = require("electron");
// Expose only specific, validated IPC methods to renderer
contextBridge.exposeInMainWorld("electron", {
    getApiPort: () => ipcRenderer.invoke("get-api-port"),
    getDesktopPath: () => ipcRenderer.invoke("get-desktop-path"),
    watchDirectory: (path) => ipcRenderer.invoke("watch-directory", path),
    onDirectoryChanged: (callback) => {
        ipcRenderer.removeAllListeners('directory-changed');
        ipcRenderer.on('directory-changed', (event, path) => callback(path));
    },
    openPath: (path, line, app) => ipcRenderer.invoke("open-path", path, line, app),
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
    readTextFile: (path) => ipcRenderer.invoke('read-text-file', path),
    readImageAsBase64: (path) => ipcRenderer.invoke('read-image-as-base64', path),
    listFiles: (args) => ipcRenderer.invoke('list-files', args),
    getFolderSize: (path) => ipcRenderer.invoke('get-folder-size', path),
    getDirectoryStats: (path) => ipcRenderer.invoke('get-directory-stats', path),
    searchContent: (args) => ipcRenderer.invoke('search-content', args),
    analyzeDependencies: (path) => ipcRenderer.invoke('analyze-dependencies', path),
    detectProject: (path) => ipcRenderer.invoke('detect-project', path),
    analyzeApiEndpoints: (path) => ipcRenderer.invoke('analyze-api-endpoints', path),
    analyzeRoute: (filePath) => ipcRenderer.invoke('analyze-route', filePath),
    // Get file path from dropped File object
    getPathForFile: (file) => webUtils.getPathForFile(file),
});
