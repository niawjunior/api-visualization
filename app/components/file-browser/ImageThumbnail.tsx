'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';

// Simple in-memory cache to avoid flickering on re-renders, 
// though browser checking usually handles same-url well.
const thumbnailCache = new Map<string, string>();

interface ImageThumbnailProps {
    path: string;
    name: string;
    className?: string;
    size?: number;
}

export function ImageThumbnail({ path, name, className, size = 64 }: ImageThumbnailProps) {
    const [src, setSrc] = useState<string | null>(thumbnailCache.get(path) || null);
    const [loading, setLoading] = useState(!src);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (thumbnailCache.has(path)) {
            setSrc(thumbnailCache.get(path)!);
            setLoading(false);
            return;
        }

        let mounted = true;

        const loadThumbnail = async () => {
            try {
                // Electron IPC
                if (window.electron) {
                    const base64 = await window.electron.readImageAsBase64(path);
                    if (mounted && base64) {
                        thumbnailCache.set(path, base64);
                        setSrc(base64);
                    } else if (mounted) {
                        setError(true);
                    }
                }
            } catch (e) {
                if (mounted) setError(true);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadThumbnail();

        return () => { mounted = false; };
    }, [path]);

    if (error || (!src && !loading)) {
        return (
            <div className={cn("flex items-center justify-center bg-secondary/50 text-muted-foreground", className)}>
                <ImageIcon className="w-1/2 h-1/2 opacity-50" />
            </div>
        );
    }

    if (loading) {
        return (
            <div className={cn("animate-pulse bg-secondary/50 rounded-md", className)} />
        );
    }

    return (
        <div style={{ width: size, height: size }} className={cn("overflow-hidden shrink-0", className)}>
            <motion.img 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                src={src!} 
                alt={name} 
                className="w-full h-full object-cover"
                draggable={false}
            />
        </div>
    );
}
