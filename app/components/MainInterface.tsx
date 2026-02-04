'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FileExplorer } from './file-browser/FileExplorer';
import { useFileSync } from './hooks/useFileSync';
import { useProjectDetection } from './hooks/useProjectDetection';
import { HeaderControls } from './HeaderControls';
import VisualProjectMap from './visual/VisualProjectMap';

export default function MainInterface() {
  const [showExplorer, setShowExplorer] = useState(true);
  
  // File state management via custom hook
  const {
    activeFiles,
    currentPath,
    activeFilters,
    handleNavigate,
    handleRefresh,
    handleClearFilters,
    isRefreshing,
  } = useFileSync();

  // Project detection via extracted hook
  // Project detection via extracted hook
  const { detectedProject } = useProjectDetection(currentPath);

  const handleOpenFile = async (path: string, line?: number, app?: string) => {
      if (window.electron) {
          await window.electron.openPath(path, line, app);
      }
  };

  // Watch directory for changes
  useEffect(() => {
    if (currentPath && window.electron) {
      window.electron.watchDirectory(currentPath);
      window.electron.onDirectoryChanged((path) => {
          if (path === currentPath) {
             handleRefresh();
          }
      });
    }
  }, [currentPath, handleRefresh]);

  return (
    <div className="flex h-full w-full overflow-hidden p-4 gap-4 pb-0 md:pb-4 relative">
       {/* Sidebar */}
      {showExplorer && (
        <div className={cn(
          "h-full shrink-0 border-r border-border/50 transition-all duration-300",
          !currentPath ? "w-[850px]" : "w-[380px]"
        )}>
          <FileExplorer 
            files={activeFiles} 
            currentPath={currentPath}
            className="h-full shadow-lg"
            activeFilters={activeFilters}
            onClearFilters={handleClearFilters}
            onNavigate={handleNavigate}
            onRefresh={handleRefresh}
            isLoading={isRefreshing}
          />
        </div>
      )}

      {/* Main Area */}
      <div 
        className={cn(
          "flex-1 flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-sm relative transition-all min-w-0"
        )}
      >
        <HeaderControls
          showExplorer={showExplorer}
          setShowExplorer={setShowExplorer}
          activeFilesCount={activeFiles.length}
        />
        
        <div className="w-full h-full relative">
            <VisualProjectMap 
                files={activeFiles}
                currentPath={currentPath}
                detectedProject={detectedProject}
                onNavigate={handleNavigate}
                onOpenFile={handleOpenFile}
            />
        </div>
      </div>
    </div>
  );
}
