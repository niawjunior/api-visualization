'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileExplorer, FileEntry } from './file-browser/FileExplorer';
import VisualProjectMap from './visual/VisualProjectMap';
import { useProjectDetection } from './hooks/useProjectDetection';
import { useRecentProjects } from './hooks/useRecentProjects';
import { Button } from '@/components/ui/button';
import { FolderOpen, Clock, X, Folder, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MainInterface() {
  // Project State
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Sidebar State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nami-sidebar-collapsed') === 'true';
    }
    return false;
  });

  // Recent projects
  const { recentProjects, addRecentProject, removeRecentProject } = useRecentProjects();

  // Project detection for view mode capabilities
  const { detectedProject } = useProjectDetection(projectRoot);

  // Open a project (from dialog or recent)
  const openProject = useCallback((path: string) => {
    setProjectRoot(path);
    setCurrentPath(path);
    addRecentProject(path);
  }, [addRecentProject]);

  // Handle opening a new project via dialog
  const handleOpenProject = async () => {
    if (!window.electron) return;
    const selectedPath = await window.electron.selectDirectory();
    if (selectedPath) {
      openProject(selectedPath);
    }
  };

  // Handle closing the project (back to entry screen)
  const handleCloseProject = () => {
    setProjectRoot('');
    setCurrentPath('');
    setFiles([]);
  };

  // Handle navigation within project
  const handleNavigate = useCallback((path: string) => {
    // Prevent navigating above project root
    if (projectRoot && !path.startsWith(projectRoot)) {
      return; // Restrict to project scope
    }
    setCurrentPath(path);
  }, [projectRoot]);

  // Toggle sidebar and persist preference
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('nami-sidebar-collapsed', String(newValue));
      return newValue;
    });
  }, []);

  // Keyboard shortcut: Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // Refresh file list when currentPath changes
  useEffect(() => {
    if (!currentPath || !window.electron) {
      setFiles([]);
      return;
    }

    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const result = await window.electron.listFiles({ path: currentPath });
        if (result.success && Array.isArray(result.files)) {
          setFiles(result.files);
        }
      } catch (err) {
        console.error('Failed to load files:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadFiles();
  }, [currentPath]);

  const handleOpenFile = async (path: string, line?: number, app?: string) => {
    if (window.electron) {
      await window.electron.openPath(path, line, app);
    }
  };

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && window.electron) {
      const file = files[0];
      const path = window.electron.getPathForFile(file);
      if (path) {
        openProject(path);
      }
    }
  }, [openProject]);

  // 1. Entry Screen (No Project Open)
  if (!projectRoot) {
    return (
      <div 
        className="h-full w-full flex flex-col items-center justify-center p-8 relative overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-background" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:32px_32px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />

        {/* Drop zone overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
            <div className="p-8 rounded-2xl border-2 border-dashed border-border bg-card shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-xl bg-muted flex items-center justify-center mb-4">
                  <FolderOpen className="w-8 h-8 text-foreground animate-bounce" />
                </div>
                <p className="text-xl font-semibold text-foreground">Drop folder here</p>
                <p className="text-sm text-muted-foreground mt-1">Release to open project</p>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center gap-8 max-w-md w-full">
          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-xl bg-foreground flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Nami
            </h1>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Explore, test, and visualize your API endpoints.
            </p>
          </div>
          
          {/* Action buttons */}
          <div className="flex flex-col items-center gap-3 w-full">
            <Button size="lg" onClick={handleOpenProject} className="gap-2 shadow-md hover:shadow-lg transition-shadow">
              <FolderOpen className="w-5 h-5" />
              Open Project
            </Button>
            <p className="text-xs text-muted-foreground">or drag & drop a folder anywhere</p>
          </div>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="w-full mt-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium uppercase tracking-wider">Recent Projects</span>
              </div>
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <div
                    key={project.path}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-all cursor-pointer"
                    onClick={() => openProject(project.path)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Folder className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate font-mono">{project.path}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentProject(project.path);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-all"
                      title="Remove from recents"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Project View (Split: FileExplorer + VisualProjectMap with modes)
  return (
    <div className="flex h-full w-full overflow-hidden p-4 gap-4 pb-0 md:pb-4 relative">
      {/* Sidebar - File Explorer (Collapsible) */}
      <div 
        className={cn(
          "h-full shrink-0 border-r border-border/50 transition-all duration-300 ease-in-out overflow-hidden",
          sidebarCollapsed ? "w-0 border-r-0" : "w-[320px]"
        )}
      >
        <FileExplorer
          files={files}
          currentPath={currentPath}
          className="h-full shadow-lg w-[320px]"
          onNavigate={handleNavigate}
          onRefresh={() => setCurrentPath(currentPath)} // Trigger re-fetch
          isLoading={isLoading}
        />
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "absolute z-30 p-1.5 rounded-md bg-background border border-border shadow-sm hover:bg-muted transition-all",
          sidebarCollapsed ? "left-6 top-6" : "left-[332px] top-6"
        )}
        title={sidebarCollapsed ? "Show sidebar (⌘B)" : "Hide sidebar (⌘B)"}
      >
        {sidebarCollapsed ? (
          <PanelLeft className="w-4 h-4 text-muted-foreground" />
        ) : (
          <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Main Area - VisualProjectMap (includes Structure/Deps/API modes) */}
      <div className="flex-1 flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-sm relative transition-all min-w-0">
        <VisualProjectMap
          files={files}
          currentPath={currentPath}
          detectedProject={detectedProject}
          onNavigate={handleNavigate}
          onOpenFile={handleOpenFile}
          onClose={handleCloseProject}
        />
      </div>
    </div>
  );
}
