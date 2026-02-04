'use client';

import { Folder, Search, X, RefreshCw, ChevronLeft, Home, Monitor, Download, FileText, Clock, Pencil, Sparkles, FileSearch, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../ThemeToggle';
import { useState, useRef, useEffect } from 'react';

interface QuickPath {
  name: string;
  path: string;
  icon: any;
}

interface FileExplorerHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  onClearFilters?: () => void;

  selectedCount: number;
  quickPaths: QuickPath[];
  recentPaths: string[];
  onSearch: (query: string, mode: 'name' | 'content') => void;
  isSearching?: boolean;
}

export function FileExplorerHeader({
  currentPath,
  onNavigate,
  onRefresh,
  onClearFilters,

  selectedCount,
  quickPaths,
  recentPaths,
  onSearch,
  isSearching = false
}: FileExplorerHeaderProps) {
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [query, setQuery] = useState('');
  
  useEffect(() => {
      onSearch(query, searchMode);
  }, [query, searchMode]);

  return (
    <div className="p-3 border-b border-border bg-secondary/50 flex flex-col gap-2">
      <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground min-w-0">


              {currentPath && currentPath !== '/' && (
                  <button 
                      onClick={() => {
                          const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                          onNavigate(parentPath);
                      }}
                      className="p-1 hover:bg-secondary rounded transition-colors -ml-1 shrink-0"
                      title="Go back"
                  >
                      <ChevronLeft className="w-4 h-4" />
                  </button>
              )}
              <Folder className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">File Explorer</span>
              {/* Selection count badge */}
              {selectedCount > 1 && (
                  <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded-full shrink-0">
                      {selectedCount}
                  </span>
              )}
          </h3>
          {/* Header Actions */}
          <div className="flex items-center gap-1 shrink-0">


              {/* Refresh button */}
              {onRefresh && (
              <button 
                  onClick={onRefresh}
                  className="p-1.5 hover:bg-secondary rounded transition-colors"
                  title="Refresh"
              >
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
          )}
          <ThemeToggle />
      </div>
    </div>
      
      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
            <Search className="w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </div>
        <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchMode === 'content' ? "Search inside files..." : "Filter files by name..."}
            className="w-full h-8 pl-8 pr-20 bg-background border border-border rounded-md text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all font-medium text-foreground"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
             {query && (
                 <button onClick={() => setQuery('')} className="p-1 hover:bg-secondary rounded-full mr-1">
                     <X className="w-3 h-3 text-muted-foreground" />
                 </button>
             )}
             <button 
                onClick={() => setSearchMode(prev => prev === 'name' ? 'content' : 'name')}
                className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border",
                    searchMode === 'content' 
                        ? "bg-primary/10 border-primary/20 text-primary" 
                        : "bg-secondary border-transparent text-muted-foreground hover:bg-secondary/80"
                )}
                title={searchMode === 'content' ? "Switch to Filename Search" : "Switch to Content Search"}
             >
                 {searchMode === 'content' ? <FileText className="w-3 h-3" /> : <FileSearch className="w-3 h-3" />}
                 {searchMode === 'content' ? 'Content' : 'Name'}
             </button>
        </div>
      </div>
      

      {currentPath && (
          <p className="text-[10px] text-muted-foreground truncate font-mono" title={currentPath}>
              {currentPath}
          </p>
      )}
    </div>
  );
}
