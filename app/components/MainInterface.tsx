'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileExplorer } from './file-browser/FileExplorer';
import { useFileSync } from './hooks/useFileSync';
import { HeaderControls } from './HeaderControls';
import VisualProjectMap from './visual/VisualProjectMap';
import { Dashboard } from './dashboard/Dashboard';

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
        
        {/* If no path, our file explorer (dashboard inside it) handles the "Welcome" view. 
            So this main area should likely be the Visual Map or empty.
            Wait, in Nami, when currentPath is empty, the FileExplorer WIDENS (w-[850px]) and shows Dashboard INSIDE it.
            And the main chat area shrinks.

            Here, if currentPath is empty:
            - Sidebar is w-[850px].
            - Main Area is flex-1.

            If currentPath is set:
            - Sidebar is w-[380px].
            - Main Area shows Visual Map.
        */}
        <div className="w-full h-full relative">
            <VisualProjectMap 
                files={activeFiles}
                currentPath={currentPath}
                onNavigate={handleNavigate}
                onOpenFile={(path) => window.electron?.openPath(path)}
            />
        </div>
      </div>
    </div>
  );
}
