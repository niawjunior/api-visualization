/**
 * Supported project types for detection
 */
export type ProjectType = 'nextjs' | 'vite' | 'node' | 'python' | 'unknown';

export interface ProjectInfo {
    path: string;
    type: ProjectType;
    isProject: boolean;
    name?: string;
    version?: string;
    dependencies?: string[];
    devDependencies?: string[];
    configFiles?: string[];
}

export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    lastModified: number;
    childCount?: number;
    preview?: string;
}
