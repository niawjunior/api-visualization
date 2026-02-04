export {};

// API Endpoint Types
interface RouteParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  children?: SchemaField[];
}

interface DependencyInfo {
  name: string;
  module: string;
  type: 'service' | 'database' | 'external' | 'utility';
  usage?: string;
}

interface GroupedDependency {
  module: string;
  moduleLabel: string;
  type: 'service' | 'database' | 'external' | 'utility';
  items: string[];
  count: number;
}

interface ApiDependencies {
  services: DependencyInfo[];
  database: DependencyInfo[];
  external: DependencyInfo[];
  utilities: DependencyInfo[];
  grouped: GroupedDependency[];
  tables: string[];
  apiCalls: string[];
}

interface ApiEndpoint {
  path: string;
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS')[];
  params: RouteParam[];
  queryParams: RouteParam[];
  requestBody?: SchemaField[];
  responseBody?: SchemaField[];
  responses: Array<{
    statusCode?: number;
    isError: boolean;
    schema: SchemaField[];
  }>;
  dependencies?: ApiDependencies;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  description?: string;
}

declare global {
  interface Window {
    electron: {
      getApiPort: () => Promise<number>;
      getDesktopPath: () => Promise<string>;
      watchDirectory: (path: string) => Promise<void>;
      onDirectoryChanged: (callback: (path: string) => void) => void;
      openPath: (path: string, line?: number, app?: string) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
      readTextFile: (path: string) => Promise<string>;
      readImageAsBase64: (path: string) => Promise<string>;
      listFiles: (args: { path: string; extensions?: string[]; sort?: 'name' | 'newest' | 'oldest' | 'type' }) => Promise<{ success: boolean; files: any[]; error?: string }>;
      batchRename: (operations: { original: string; new: string }[]) => Promise<{ success: string[]; errors: string[] }>;
      getFolderSize: (path: string) => Promise<number>;
      getDirectoryStats: (path: string) => Promise<{ totalSize: number; fileCount: number; folderCount: number; types: Record<string, number> }>;
      searchContent: (args: { directory: string; query: string; extensions?: string[] }) => Promise<{ matches: any[]; totalMatches: number }>;
      analyzeDependencies: (path: string) => Promise<{ nodes: any[]; edges: any[] }>;
      detectProject: (path: string) => Promise<{ 
        path: string; 
        type: 'nextjs' | 'vite' | 'node' | 'python' | 'unknown'; 
        isProject: boolean; 
        name?: string; 
        version?: string;
        dependencies?: string[]; 
        configFiles?: string[] 
      }>;
      analyzeApiEndpoints: (path: string) => Promise<{ 
        success: boolean; 
        endpoints: ApiEndpoint[]; 
        error?: string 
      }>;
      analyzeRoute: (filePath: string) => Promise<{
        routes: Array<{
          method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
          path: string;
          filePath: string;
          requestBody?: { properties: Array<{ name: string; type: string; optional: boolean }> };
          responses: Array<{
            schema: { properties: Array<{ name: string; type: string; optional: boolean }> };
            statusCode?: number;
            isError: boolean;
          }>;
        }>;
        errors: string[];
      }>;
      getPathForFile: (file: File) => string;
      getAvailableEditors: () => Promise<Array<{ name: string; path: string; key: string }>>;
    };
  }
}
