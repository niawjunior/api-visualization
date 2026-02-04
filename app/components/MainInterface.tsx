'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileExplorer, FileEntry } from './file-browser/FileExplorer';
import VisualProjectMap from './visual/VisualProjectMap';
import { useProjectDetection } from './hooks/useProjectDetection';
import { useRecentProjects } from './hooks/useRecentProjects';
import { Button } from '@/components/ui/button';
import { FolderOpen, Clock, X, Folder } from 'lucide-react';

export default function MainInterface() {
  // Project State
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  // 1. Entry Screen (No Project Open)
  if (!projectRoot) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background gap-8 p-8">
        <div className="text-center space-y-2">
          <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground/30" />
          <h1 className="text-2xl font-bold tracking-tight">API Visualization</h1>
          <p className="text-muted-foreground text-sm max-w-xs">
            Open a project folder to start exploring its API endpoints.
          </p>
        </div>
        
        <Button size="lg" onClick={handleOpenProject} className="gap-2">
          <FolderOpen className="w-5 h-5" />
          Open Project
        </Button>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="w-full max-w-sm mt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium uppercase tracking-wider">Recent Projects</span>
            </div>
            <div className="space-y-1">
              {recentProjects.map((project) => (
                <div
                  key={project.path}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => openProject(project.path)}
                >
                  <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{project.path}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentProject(project.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
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
    );
  }

  // 2. Project View (Split: FileExplorer + VisualProjectMap with modes)
  return (
    <div className="flex h-full w-full overflow-hidden p-4 gap-4 pb-0 md:pb-4 relative">
      {/* Sidebar - File Explorer */}
      <div className="w-[320px] h-full shrink-0 border-r border-border/50">
        <FileExplorer
          files={files}
          currentPath={currentPath}
          className="h-full shadow-lg"
          onNavigate={handleNavigate}
          onRefresh={() => setCurrentPath(currentPath)} // Trigger re-fetch
          isLoading={isLoading}
        />
      </div>

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
