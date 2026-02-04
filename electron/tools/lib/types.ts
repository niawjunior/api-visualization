/**
 * Supported project types for detection
 */
// Add to global.d.ts if needed, but for now strict typing in files
export interface DetectedEditor {
    name: string;
    path: string;
    key: string;
}

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
