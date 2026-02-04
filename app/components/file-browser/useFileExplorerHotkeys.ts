import { useEffect } from 'react';
import { FileEntry } from './FileEntryRow';

interface UseHotkeysProps {
    files: FileEntry[];
    selectedFiles: Set<string>;
    onNavigate?: (path: string) => void;
    setPreviewFile: (file: FileEntry | null) => void;
    setContextMenu: (state: any) => void;
    clearSelection: () => void;
}

export function useFileExplorerHotkeys({ 
    files, 
    selectedFiles, 
    onNavigate, 
    setPreviewFile, 
    setContextMenu,
    clearSelection 
}: UseHotkeysProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ... (Existing hotkey logic for arrow keys etc uses React state, so unchanged mostly) ...
            
            // Enter to Open
            if (e.key === 'Enter') {
                if (selectedFiles.size > 0) {
                     const path = Array.from(selectedFiles)[0];
                     const file = files.find(f => f.path === path);
                     if (file) {
                         if (file.isDirectory) onNavigate?.(file.path);
                         else if (window.electron) window.electron.openPath(file.path);
                     }
                }
            }

            // Space to Preview
            if (e.code === 'Space') {
                 e.preventDefault(); // Prevent scroll
                  if (selectedFiles.size > 0) {
                     const path = Array.from(selectedFiles)[0];
                     const file = files.find(f => f.path === path);
                     // Toggle preview
                     // We just set preview file, UI handles toggle if we pass current state? 
                     // Simple implementation:
                     if (file) setPreviewFile(file);
                 }
            }
            
            // Cmd+O to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
                e.preventDefault();
                if (window.electron && selectedFiles.size > 0) {
                    const path = Array.from(selectedFiles)[0];
                    window.electron.openPath(path);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [files, selectedFiles, onNavigate, setPreviewFile]);
}
