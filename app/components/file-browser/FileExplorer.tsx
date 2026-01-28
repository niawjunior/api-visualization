'use client';

import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { FileExplorerSkeleton } from './FileExplorerSkeleton';

import { FileEntryRow, formatSize } from './FileEntryRow';
import { FileExplorerHeader } from './FileExplorerHeader';
import { FileContextMenu } from './FileContextMenu';
import { FilePreviewPanel } from './FilePreviewPanel';
import { useFileSelection } from './useFileSelection';
import { useFolderSizes } from './useFolderSizes';
import { useFileNavigation } from './useFileNavigation';
import { useSmartSuggestions } from './useSmartSuggestions';
import { useFileExplorerHotkeys } from './useFileExplorerHotkeys';
import { Dashboard } from '../dashboard/Dashboard';
import type { FileEntry } from '@/lib/types';

// Re-export for backwards compatibility
export type { FileEntry } from '@/lib/types';

interface FileExplorerProps {
  files: FileEntry[];
  currentPath?: string;
  className?: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
  onNavigate?: (path: string) => void;
  onRefresh?: () => void;
  onSuggestionClick?: (message: string) => void;
  isLoading?: boolean;
}

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const isTextFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['txt', 'md', 'json', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'log', 'sh', 'py', 'c', 'cpp', 'h', 'ini', 'conf', 'csv'].includes(ext || '');
};

export const FileExplorer = memo(function FileExplorer({ 
  files, 
  currentPath, 
  className, 
  activeFilters,
  onClearFilters,
  onNavigate,
  onRefresh,
  onSuggestionClick,
  isLoading = false
}: FileExplorerProps) {

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileEntry } | null>(null);

  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Custom Hooks
  const { recentPaths, quickPaths } = useFileNavigation(currentPath);
  
  // Determine displayed files
  const displayedFiles = isSearching && searchMode === 'content' ? searchResults : 
                         searchQuery && searchMode === 'name' ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) :
                         files;

  const { selectedFiles, setSelectedFiles, handleSelect: handleSelectionChange, clearSelection } = useFileSelection(displayedFiles);
  const { folderSizes, handleCalculateSize } = useFolderSizes();
  const suggestion = useSmartSuggestions(files);

  useFileExplorerHotkeys({
      files: displayedFiles,
      selectedFiles,
      onNavigate,
      onSuggestionClick,
      setPreviewFile,
      setContextMenu,
      clearSelection
  });

  // Handle Search
  useEffect(() => {
    if (!searchQuery || searchMode === 'name') {
        setIsSearching(false);
        setSearchResults([]);
        return;
    }

    if (searchMode === 'content' && searchQuery.length > 2 && currentPath) {
        setIsSearching(true);
        const timer = setTimeout(async () => {
             try {
                 if (window.electron) {
                     const result = await window.electron.searchContent({
                         directory: currentPath,
                         query: searchQuery,
                         extensions: activeFilters
                     });
                     
                     const entries: FileEntry[] = result.matches.map((m:any) => ({
                         name: m.file.split(/[\\/]/).pop() || m.file,
                         path: m.file,
                         isDirectory: false,
                         size: 0,
                         lastModified: Date.now(),
                         preview: m.preview
                     }));
                     setSearchResults(entries);
                 }
             } catch (err) {
                 console.error(err);
             } finally {
                 // Keep isSearching to show results
             }
        }, 500); // Debounce
        return () => clearTimeout(timer);
    }
  }, [searchQuery, searchMode, currentPath, activeFilters]);

  // Handle context menu close
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);
  
  // Clear selection when path changes
  useEffect(() => {
      clearSelection();
      setPreviewFile(null);
      setSearchQuery(''); 
      setIsSearching(false);
  }, [currentPath, clearSelection]);

  const handleOpen = async (file: FileEntry) => {
      try { await window.electron?.openPath(file.path); } catch (err) {}
      setContextMenu(null);
  };

  const handleReveal = async (path: string) => {
      try { await window.electron?.showItemInFolder(path); } catch (err) {}
      setContextMenu(null);
  };
  
  const handleCopyPath = (path: string) => {
      navigator.clipboard.writeText(path);
      setContextMenu(null);
  };

  const handleClick = (file: FileEntry, index: number, modifiers: { shift: boolean; cmd: boolean }) => {
      handleSelectionChange(file, index, modifiers);
      
      if (isImageFile(file.name) || isTextFile(file.name)) {
          setPreviewFile(file);
      } else {
          setPreviewFile(null);
      }
  };

  if (isLoading) {
    return <div className={cn("h-full", className)}><FileExplorerSkeleton /></div>;
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full relative select-none shadow-sm", className)} ref={containerRef}>
      <FileExplorerHeader
        currentPath={currentPath || ''}
        onNavigate={onNavigate || (() => {})}
        onRefresh={onRefresh}
        onClearFilters={onClearFilters}
        onSuggestionClick={onSuggestionClick}

        selectedCount={selectedFiles.size}
        activeFilters={activeFilters}
        quickPaths={quickPaths}
        recentPaths={recentPaths}
        suggestion={suggestion}
        onSearch={(q, m) => {
            setSearchQuery(q);
            setSearchMode(m);
        }}
        isSearching={isSearching}
      />
      
      {!currentPath ? (
        <Dashboard 
            onNavigate={onNavigate || (() => {})} 
            onOpen={(path) => window.electron?.openPath(path)} 
        />
      ) : (
      <div className="flex-1 overflow-hidden">
        {displayedFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4">
                <Folder className="w-10 h-10 stroke-1" />
                <p className="text-xs">
                    {isSearching ? "No matches found" : "No files listed"}
                </p>
            </div>
        ) : (
            <Virtuoso
                style={{ height: '100%' }}
                data={displayedFiles}
                itemContent={(index, file) => (
                    <div className="pb-1 px-2 pt-1">
                        <FileEntryRow
                            key={file.path}
                            index={index}
                            file={file}
                            customDisplaySize={folderSizes[file.path] !== undefined ? formatSize(folderSizes[file.path]) : undefined}
                            isSelected={selectedFiles.has(file.path)}
                            onSelect={(modifiers) => handleClick(file, index, modifiers)}
                            onDoubleClick={() => {
                                if (file.isDirectory && onNavigate) onNavigate(file.path);
                                else handleOpen(file);
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY, file });
                            }}
                            onDragStart={(e) => {
                                    if (selectedFiles.has(file.path) && selectedFiles.size > 1) {
                                    const paths = Array.from(selectedFiles).join('\n');
                                    e.dataTransfer.setData("text/plain", paths);
                                } else {
                                    e.dataTransfer.setData("text/plain", file.path);
                                }
                                e.dataTransfer.effectAllowed = "copy";
                            }}
                        />
                    </div>
                )}
            />
        )}
      </div>
      )}

      <FilePreviewPanel 
         previewFile={previewFile}
         onClose={() => setPreviewFile(null)}
         onOpen={handleOpen}
      />

      <FileContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpen={handleOpen}
        onReveal={handleReveal}
        onCopyPath={handleCopyPath}
        onQuickLook={setPreviewFile}
        onCalculateSize={(file) => handleCalculateSize(file.path)}
        onSuggestionClick={onSuggestionClick}
        selectedFiles={selectedFiles}
        isImageFile={isImageFile}
      />


    </div>
  );
});
