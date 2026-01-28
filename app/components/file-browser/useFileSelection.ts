import { useState, useCallback } from 'react';
import { FileEntry } from './FileExplorer';

export function useFileSelection(files: FileEntry[]) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setLastSelectedIndex(-1);
  }, []);

  const handleSelect = useCallback((file: FileEntry, index: number, modifiers: { shift: boolean; cmd: boolean }) => {
    const { shift, cmd } = modifiers;
    
    if (shift && lastSelectedIndex >= 0) {
        // Range select
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const newSelection = new Set<string>();
        // Standard behavior: Shift+Click selects range from anchor (lastSelected) to current.
        for (let i = start; i <= end; i++) {
            if (files[i]) newSelection.add(files[i].path);
        }
        setSelectedFiles(newSelection);
    } else if (cmd) {
        // Toggle selection
        const newSelection = new Set<string>(selectedFiles);
        if (newSelection.has(file.path)) newSelection.delete(file.path);
        else newSelection.add(file.path);
        setSelectedFiles(newSelection);
        setLastSelectedIndex(index);
    } else {
        // Single select
        setSelectedFiles(new Set([file.path]));
        setLastSelectedIndex(index);
    }
  }, [files, lastSelectedIndex, selectedFiles]);

  return {
    selectedFiles,
    setSelectedFiles,
    lastSelectedIndex,
    handleSelect,
    clearSelection
  };
}
