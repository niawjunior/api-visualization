'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Eye, ExternalLink, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { FileEntry } from './FileExplorer';

interface FilePreviewPanelProps {
  previewFile: FileEntry | null;
  onClose: () => void;
  onOpen: (file: FileEntry) => void;
}

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const isTextFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['txt', 'md', 'json', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'log', 'sh', 'py', 'c', 'cpp', 'h', 'ini', 'conf', 'csv'].includes(ext || '');
};

export function FilePreviewPanel({ previewFile, onClose, onOpen }: FilePreviewPanelProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  // Load image preview
  useEffect(() => {
    if (previewFile && isImageFile(previewFile.name)) {
        setLoadingImage(true);
        setImageDataUrl(null);
        if (window.electron) { 
             window.electron.readImageAsBase64(previewFile.path)
            .then((dataUrl) => {
                setImageDataUrl(dataUrl);
                setLoadingImage(false);
            })
            .catch(() => setLoadingImage(false));
         }
    } else {
        setImageDataUrl(null);
    }
  }, [previewFile]);

  // Load text preview
  useEffect(() => {
    if (previewFile && isTextFile(previewFile.name)) {
        setLoadingText(true);
        setTextContent(null);
        if (window.electron) {
             window.electron.readTextFile(previewFile.path)
            .then((text) => {
                setTextContent(text);
                setLoadingText(false);
            })
            .catch(() => {
                setTextContent("Failed to load content.");
                setLoadingText(false);
            });
        }
    } else {
        setTextContent(null);
    }
  }, [previewFile]);

  return (
    <AnimatePresence>
        {previewFile && (isImageFile(previewFile.name) || isTextFile(previewFile.name)) && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute inset-x-0 bottom-0 bg-card border-t border-border p-3 flex flex-col gap-2 shadow-lg z-10"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        {isTextFile(previewFile.name) ? <FileText className="w-4 h-4 text-muted-foreground shrink-0" /> : <Eye className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <span className="text-xs font-medium truncate text-foreground">{previewFile.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => onOpen(previewFile)}
                            className="p-1 hover:bg-secondary rounded transition-colors"
                            title="Open in default app"
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-1 hover:bg-secondary rounded transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                    </div>
                </div>
                <div className={cn(
                    "relative w-full bg-secondary rounded-lg overflow-hidden flex items-center justify-center",
                    isTextFile(previewFile.name) ? "h-48 items-start" : "aspect-video"
                )}>
                    {isImageFile(previewFile.name) ? (
                          loadingImage ? (
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                  <span className="text-xs">Loading image...</span>
                              </div>
                          ) : imageDataUrl ? (
                              <img 
                                  src={imageDataUrl} 
                                  alt={previewFile.name}
                                  className="w-full h-full"
                                  style={{ objectFit: 'contain' }}
                              />
                          ) : (
                              <div className="text-muted-foreground text-xs flex flex-col items-center gap-1">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>Failed to load image</span>
                              </div>
                          )
                    ) : (
                          loadingText ? (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                  <span className="text-xs">Loading text...</span>
                              </div>
                          ) : textContent ? (
                              <div className="w-full h-full p-3 overflow-auto text-[10px] font-mono leading-relaxed text-foreground whitespace-pre-wrap select-text">
                                  {textContent}
                              </div>
                          ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>Failed to load content</span>
                              </div>
                          )
                    )}
                </div>
            </motion.div>
        )}
    </AnimatePresence>
  );
}
