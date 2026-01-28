'use client';

import { useState, useEffect } from 'react';
import { Home, Monitor, Download, FileText } from 'lucide-react';

export function useFileNavigation(currentPath: string | undefined) {
    const [recentPaths, setRecentPaths] = useState<string[]>([]);
    const [quickPaths, setQuickPaths] = useState<{ name: string; path: string; icon: any }[]>([]);

    // Load recent paths
    useEffect(() => {
        try {
            const stored = localStorage.getItem('nami-recent-paths');
            if (stored) setRecentPaths(JSON.parse(stored));
        } catch (e) {
             console.error('Failed to load recent paths:', e);
        }
    }, []);

    // Track visited folders
    useEffect(() => {
        if (!currentPath) return;
        setRecentPaths(prev => {
            const filtered = prev.filter(p => p !== currentPath);
            const updated = [currentPath, ...filtered].slice(0, 5);
            try {
                localStorage.setItem('nami-recent-paths', JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
    }, [currentPath]);

    // Calculate quick paths
    // REPLACED Electron Logic with Simple Defaults
    // Calculate quick paths
    useEffect(() => {
        window.electron?.getDesktopPath().then(desktopPath => {
            if (!desktopPath) return;
            const separator = desktopPath.includes('\\') ? '\\' : '/';
            const homePath = desktopPath.substring(0, desktopPath.lastIndexOf(separator));
            
            setQuickPaths([
                { name: 'Home', path: homePath, icon: Home },
                { name: 'Desktop', path: desktopPath, icon: Monitor },
                { name: 'Downloads', path: `${homePath}${separator}Downloads`, icon: Download },
                { name: 'Documents', path: `${homePath}${separator}Documents`, icon: FileText },
            ]);
        });
    }, []);

    return { recentPaths, quickPaths };
}
