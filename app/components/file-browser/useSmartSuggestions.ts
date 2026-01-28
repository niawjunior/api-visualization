'use client';

import { useState, useEffect } from 'react';
import { FileEntry } from './FileExplorer';

export function useSmartSuggestions(files: FileEntry[]) {
    const [suggestion, setSuggestion] = useState<{ message: string; subtext: string; prompt: string } | null>(null);

    useEffect(() => {
        if (!files || files.length === 0) {
            setSuggestion(null);
            return;
        }
        const fileCount = files.filter(f => !f.isDirectory).length;
        if (fileCount > 10) {
            setSuggestion({
                message: "Folder looks cluttered",
                subtext: `Organize ${fileCount} files?`,
                prompt: `I see ${fileCount} files in this folder. Can you help me organize them?`
            });
        } else if (fileCount > 5) {
            setSuggestion({
                message: "New files found",
                subtext: "Analyze contents?",
                prompt: "Analyze this folder and tell me what's inside."
            });
        } else {
            setSuggestion(null);
        }
    }, [files]);

    return suggestion;
}
