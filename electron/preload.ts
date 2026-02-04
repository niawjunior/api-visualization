const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Expose only specific, validated IPC methods to renderer
contextBridge.exposeInMainWorld("electron", {
  getApiPort: () => ipcRenderer.invoke("get-api-port"),
  getDesktopPath: () => ipcRenderer.invoke("get-desktop-path"),
  watchDirectory: (path: string) => ipcRenderer.invoke("watch-directory", path),
  onDirectoryChanged: (callback: (path: string) => void) => {
    ipcRenderer.removeAllListeners('directory-changed');
    ipcRenderer.on('directory-changed', (event: Electron.IpcRendererEvent, path: string) => callback(path));
  },
  openPath: (path: string, line?: number, app?: string) => ipcRenderer.invoke("open-path", path, line, app),
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  readTextFile: (path: string) => ipcRenderer.invoke('read-text-file', path),
  readImageAsBase64: (path: string) => ipcRenderer.invoke('read-image-as-base64', path),
  listFiles: (args: { path: string; extensions?: string[]; sort?: 'name' | 'newest' | 'oldest' | 'type' }) => ipcRenderer.invoke('list-files', args),

  getFolderSize: (path: string) => ipcRenderer.invoke('get-folder-size', path),
  getDirectoryStats: (path: string) => ipcRenderer.invoke('get-directory-stats', path),

  searchContent: (args: { directory: string; query: string; extensions?: string[] }) => ipcRenderer.invoke('search-content', args),
  analyzeDependencies: (path: string) => ipcRenderer.invoke('analyze-dependencies', path),
  detectProject: (path: string) => ipcRenderer.invoke('detect-project', path),
  analyzeApiEndpoints: (path: string) => ipcRenderer.invoke('analyze-api-endpoints', path),
  analyzeRoute: (filePath: string) => ipcRenderer.invoke('analyze-route', filePath),
  
  // Get file path from dropped File object
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getAvailableEditors: () => ipcRenderer.invoke('get-available-editors'),
});
