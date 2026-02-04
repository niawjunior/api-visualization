'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'api-viz-recent-projects';
const MAX_RECENT = 5;

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

export function useRecentProjects() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentProject[];
        setRecentProjects(parsed);
      }
    } catch (err) {
      console.error('Failed to load recent projects:', err);
    }
  }, []);

  // Save to localStorage
  const saveToStorage = useCallback((projects: RecentProject[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (err) {
      console.error('Failed to save recent projects:', err);
    }
  }, []);

  // Add a project to recents (or move to top if exists)
  const addRecentProject = useCallback((path: string) => {
    const name = path.split('/').pop() || path;
    
    setRecentProjects(prev => {
      // Remove if already exists
      const filtered = prev.filter(p => p.path !== path);
      
      // Add to front with new timestamp
      const updated: RecentProject[] = [
        { path, name, lastOpened: Date.now() },
        ...filtered
      ].slice(0, MAX_RECENT); // Keep only MAX_RECENT items
      
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Remove a project from recents
  const removeRecentProject = useCallback((path: string) => {
    setRecentProjects(prev => {
      const updated = prev.filter(p => p.path !== path);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Clear all recents
  const clearRecentProjects = useCallback(() => {
    setRecentProjects([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    recentProjects,
    addRecentProject,
    removeRecentProject,
    clearRecentProjects
  };
}
