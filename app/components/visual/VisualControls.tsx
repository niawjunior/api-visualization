'use client';

import React from 'react';
import { Search, Layout, GitFork, X, Hexagon, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '../settings/SettingsDialog';
import type { DetectedProject, ProjectType } from '@/lib/types';

// Project type display configuration
interface ProjectTypeConfig {
  icon: React.ReactNode;
  label: string;
  color: string;
}

const projectTypeConfig: Record<ProjectType, ProjectTypeConfig> = {
  nextjs: { icon: <Hexagon size={14} />, label: 'Next.js', color: 'text-blue-500' },
  vite: { icon: <Hexagon size={14} />, label: 'Vite', color: 'text-purple-500' },
  node: { icon: <Hexagon size={14} />, label: 'Node.js', color: 'text-green-500' },
  python: { icon: <Hexagon size={14} />, label: 'Python', color: 'text-yellow-500' },
  unknown: { icon: <Hexagon size={14} />, label: 'Folder', color: 'text-muted-foreground' },
};

export type ViewMode = 'structure' | 'dependencies' | 'api';

interface VisualControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  detectedProject: DetectedProject | null;
  canShowDependencies: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onClose?: () => void;
  className?: string;
}

export function VisualControls({
  searchQuery,
  setSearchQuery,
  detectedProject,
  canShowDependencies,
  viewMode,
  setViewMode,
  onClose,
  className
}: VisualControlsProps) {
  const config = projectTypeConfig[detectedProject?.type || 'unknown'];

  return (
    <div className={cn(
      "absolute top-4 right-4 z-20 flex flex-col gap-2",
      "p-4 rounded-xl border border-border/40 shadow-xl",
      "bg-white/80 dark:bg-slate-900/80 backdrop-blur-md",
      className
    )}>
      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search nodes..."
          className="w-64 pl-9 pr-8 py-2 rounded-lg bg-secondary/50 border border-transparent focus:border-primary/50 focus:bg-background outline-none text-sm transition-all text-foreground"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="h-px bg-border/50 my-1" />

      {/* Mode Toggle */}
      <div className="flex bg-secondary/50 p-1 rounded-lg gap-1">
        <button
          onClick={() => setViewMode('structure')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
            viewMode === 'structure'
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          <Layout size={14} />
          Structure
        </button>
        {canShowDependencies && (
          <button
            onClick={() => setViewMode('dependencies')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === 'dependencies'
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="View Import/Export Relationships"
          >
            <GitFork size={14} />
            Deps
          </button>
        )}
        {canShowDependencies && (
          <button
            onClick={() => setViewMode('api')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === 'api'
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="View API Endpoints"
          >
            <Network size={14} />
            API
          </button>
        )}
      </div>
      
      {/* Project Indicator */}
      {detectedProject?.isProject && (
        <div className="flex items-center justify-between px-1 pt-1">
           <span className={cn("text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1", config.color)}>
              {config.icon}
              {config.label} Project
           </span>
        </div>
      )}

      {/* Non-project indicator */}
      {!detectedProject?.isProject && (
        <div className="flex items-center justify-between px-1 pt-1">
           <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              File System
           </span>
        </div>
      )}

      {/* Settings & Close Project */}
      {onClose && (
        <>
          <div className="h-px bg-border/50 my-1" />
          <div className="flex items-center gap-2">
            <SettingsDialog />
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              Close Project
            </button>
          </div>
        </>
      )}
    </div>
  );
}
