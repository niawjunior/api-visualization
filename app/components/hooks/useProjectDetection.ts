'use client';

import { useState, useEffect } from 'react';
import { DetectedProject } from '@/lib/types';

/**
 * Hook for detecting project type when path changes
 * @param currentPath - The current directory path
 * @returns Object containing detected project info and loading state
 */
export function useProjectDetection(currentPath: string | null) {
  const [detectedProject, setDetectedProject] = useState<DetectedProject | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!currentPath || !window.electron?.detectProject) {
      setDetectedProject(null);
      return;
    }

    setIsDetecting(true);
    window.electron.detectProject(currentPath)
      .then(setDetectedProject)
      .catch(() => setDetectedProject(null))
      .finally(() => setIsDetecting(false));
  }, [currentPath]);

  return { detectedProject, isDetecting };
}
