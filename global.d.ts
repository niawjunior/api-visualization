export {};

declare global {
  interface Window {
    electron: {
      getApiPort: () => Promise<number>;
      getDesktopPath: () => Promise<string>;
      watchDirectory: (path: string) => Promise<void>;
      onDirectoryChanged: (callback: (path: string) => void) => void;
      openPath: (path: string) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
      readTextFile: (path: string) => Promise<string>;
      readImageAsBase64: (path: string) => Promise<string>;
      listFiles: (args: { path: string; extensions?: string[]; sort?: 'name' | 'newest' | 'oldest' | 'type' }) => Promise<{ success: boolean; files: any[]; error?: string }>;
      batchRename: (operations: { original: string; new: string }[]) => Promise<{ success: string[]; errors: string[] }>;
      getFolderSize: (path: string) => Promise<number>;
      getDirectoryStats: (path: string) => Promise<{ totalSize: number; fileCount: number; folderCount: number; types: Record<string, number> }>;
      searchContent: (args: { directory: string; query: string; extensions?: string[] }) => Promise<{ matches: any[]; totalMatches: number }>;
      analyzeDependencies: (path: string) => Promise<{ nodes: any[]; edges: any[] }>;
      getPathForFile: (file: File) => string;
    };
  }
}
