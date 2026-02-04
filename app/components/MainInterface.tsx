'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileExplorer, FileEntry } from './file-browser/FileExplorer';
import VisualProjectMap from './visual/VisualProjectMap';
import { useProjectDetection } from './hooks/useProjectDetection';
import { Button } from '@/components/ui/button';
import { FolderOpen } from 'lucide-react';

export default function MainInterface() {
  // Project State
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Project detection for view mode capabilities
  const { detectedProject } = useProjectDetection(projectRoot);

  // Handle opening a new project
  const handleOpenProject = async () => {
    if (!window.electron) return;
    const selectedPath = await window.electron.selectDirectory();
    if (selectedPath) {
      setProjectRoot(selectedPath);
      setCurrentPath(selectedPath);
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
      <div className="h-full w-full flex flex-col items-center justify-center bg-background gap-6 p-8">
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
