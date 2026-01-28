import { useState, useCallback } from 'react';

export function useFolderSizes() {
    const [folderSizes, setFolderSizes] = useState<Record<string, number>>({});

    const handleCalculateSize = useCallback(async (path: string) => {
        if (typeof window !== 'undefined' && window.electron) {
            setFolderSizes(prev => ({ ...prev, [path]: -1 })); // Loading state logic handled by UI check usually, or use -1
            try {
                const size = await window.electron.getFolderSize(path);
                setFolderSizes(prev => ({ ...prev, [path]: size }));
            } catch (e) {
                console.error("Size calc failed", e);
                setFolderSizes(prev => ({ ...prev, [path]: 0 }));
            }
        }
    }, []);

    return { folderSizes, handleCalculateSize };
}
