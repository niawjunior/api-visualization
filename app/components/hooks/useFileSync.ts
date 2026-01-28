'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FileEntry } from '../file-browser/FileExplorer';

export function useFileSync() {
  const [activeFiles, setActiveFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Refresh files from filesystem using IPC
  const refreshFiles = useCallback(async (path: string, extensions?: string[]) => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    
    if (!path) {
        setCurrentPath('');
        setActiveFiles([]);
        setIsRefreshing(false);
        return;
    }

    try {
      if (window.electron) {
          const res = await window.electron.listFiles({ path, extensions });
          if (res.success && Array.isArray(res.files)) {
            setActiveFiles(res.files);
            setCurrentPath(path);
            if (extensions) {
              setActiveFilters(extensions);
            }
          }
      }
    } catch (err) {
      console.error('Failed to refresh files:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Load Desktop as default
  const loadDesktop = useCallback(async () => {
    try {
      if (window.electron) {
        const desktopPath = await window.electron.getDesktopPath();
        await refreshFiles(desktopPath);
      }
    } catch (err) {
      console.error('Failed to load desktop:', err);
    }
  }, [refreshFiles]);

  // Initial load
  useEffect(() => {
    loadDesktop();
  }, []); // Run only once on mount

  // Navigate to a folder
  const handleNavigate = useCallback((path: string) => {
    refreshFiles(path, activeFilters);
  }, [refreshFiles, activeFilters]);

  // Refresh current path
  const handleRefresh = useCallback(() => {
    if (currentPath) {
      refreshFiles(currentPath, activeFilters);
    }
  }, [currentPath, activeFilters, refreshFiles]);

  // Clear filters and refresh
  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    if (currentPath) {
      refreshFiles(currentPath, []);
    }
  }, [currentPath, refreshFiles]);

  return {
    activeFiles,
    currentPath,
    activeFilters,
    isRefreshing,
    refreshFiles,
    loadDesktop,
    handleNavigate,
    handleRefresh,
    handleClearFilters,
    setActiveFiles,
    setCurrentPath,
    setActiveFilters,
  };
}
