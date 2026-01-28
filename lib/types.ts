// ============================================
// Shared Types - Used by both Frontend and Backend
// ============================================

/**
 * Supported project types for detection
 */
export type ProjectType = 'nextjs' | 'vite' | 'node' | 'python' | 'unknown';

/**
 * Result of project detection
 */
export interface DetectedProject {
  path: string;
  type: ProjectType;
  isProject: boolean;
  name?: string;
  version?: string;
  dependencies?: string[];
  devDependencies?: string[];
  configFiles?: string[];
}

/**
 * File entry for file browser and visualization
 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  childCount?: number;
  preview?: string; // For search results
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  id: string;
  label: string;
  type: 'file' | 'package' | 'external';
  isExternal?: boolean;
}

/**
 * Dependency graph edge
 */
export interface DependencyEdge {
  source: string;
  target: string;
}

/**
 * Result of dependency analysis
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}
