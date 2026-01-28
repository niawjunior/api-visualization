import React from 'react';
import { Search, Layout, Share2, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VisualControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  graphMode: 'structure' | 'dependency';
  setGraphMode: (mode: 'structure' | 'dependency') => void;
  className?: string;
}

export function VisualControls({
  searchQuery,
  setSearchQuery,
  graphMode,
  setGraphMode,
  className
}: VisualControlsProps) {
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
      <div className="flex bg-secondary/50 p-1 rounded-lg">
        <button
          onClick={() => setGraphMode('structure')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            graphMode === 'structure' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          <Layout size={14} />
          Structure
        </button>
        <button
          onClick={() => setGraphMode('dependency')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            graphMode === 'dependency' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
          title="Dependency View"
        >
          <Share2 size={14} />
          Relations
        </button>
      </div>
      
      {/* Stats / Info */}
      <div className="flex items-center justify-between px-1 pt-1">
         <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {graphMode === 'structure' ? 'File System' : 'Import Graph'}
         </span>
         <button className="text-muted-foreground hover:text-foreground hover:bg-secondary/80 p-1 rounded">
            <Settings2 size={14} />
         </button>
      </div>
    </div>
  );
}
