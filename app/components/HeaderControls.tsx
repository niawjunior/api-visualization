'use client';

import { LayoutPanelLeft } from 'lucide-react';

interface HeaderControlsProps {
  showExplorer: boolean;
  setShowExplorer: (show: boolean) => void;
  activeFilesCount: number;
}

export function HeaderControls({
  showExplorer,
  setShowExplorer,
  activeFilesCount
}: HeaderControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2 no-drag">
      {!showExplorer && activeFilesCount > 0 && (
        <button 
          onClick={() => setShowExplorer(true)}
          className="p-2 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors"
          title="Show Files"
        >
          <LayoutPanelLeft size={16} />
        </button>
      )}
    </div>
  );
}
