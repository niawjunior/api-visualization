'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileCode, Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CodeViewerModalProps {
    filePath: string;
    lineNumber?: number;
    onClose: () => void;
    isOpen: boolean;
}

export function CodeViewerModal({ filePath, lineNumber, onClose, isOpen }: CodeViewerModalProps) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    
    // Build relative path for display
    const relativePath = filePath.split('/').slice(-3).join('/');
    const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

    useEffect(() => {
        if (isOpen && filePath) {
            setLoading(true);
            setError(null);
            
            if (!window.electron) {
                setError('Electron API unavailable. Please restart the application.');
                setLoading(false);
                return;
            }

            window.electron.readTextFile(filePath)
                .then((text) => {
                    if (text === null || text === undefined) {
                         // Some fs errors might return null instead of throwing
                         throw new Error('File content is empty or unreadable');
                    }
                    setContent(text);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error('File read error:', err);
                    setError('Failed to read file. It may not exist or require permissions.');
                    setLoading(false);
                });
        }
    }, [isOpen, filePath]);

    // Scroll to line
    useEffect(() => {
        if (!loading && content && lineNumber && lineRefs.current[lineNumber]) {
            setTimeout(() => {
                lineRefs.current[lineNumber]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add highlight effect
                lineRefs.current[lineNumber]?.classList.add('bg-primary/20');
                setTimeout(() => {
                    lineRefs.current[lineNumber]?.classList.remove('bg-primary/20');
                }, 2000);
            }, 300);
        }
    }, [loading, content, lineNumber]);

    const handleCopy = async () => {
        if (!content) return;
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 md:p-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-5xl h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-md text-primary">
                                    <FileCode className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        {relativePath}
                                        {lineNumber && <span className="text-muted-foreground font-normal">:{lineNumber}</span>}
                                    </h3>
                                    <p className="text-xs text-muted-foreground truncate max-w-md" title={filePath}>
                                        {filePath}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs gap-1.5 h-8">
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => window.electron.openPath(filePath, lineNumber, 'system')}
                                    className="text-xs gap-1.5 h-8"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open Externally
                                </Button>
                                <div className="w-px h-6 bg-border mx-1" />
                                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm relative">
                            {loading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <p>Loading file content...</p>
                                </div>
                            ) : error ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive">
                                    <p>{error}</p>
                                </div>
                            ) : content ? (
                                <div className="min-w-full inline-block">
                                    {/* Simple Line Render */}
                                    {content.split('\n').map((lineText, i) => {
                                        const lineNum = i + 1;
                                        const isTarget = lineNum === lineNumber;
                                        return (
                                            <div 
                                                key={i} 
                                                ref={el => { lineRefs.current[lineNum] = el }}
                                                className={cn(
                                                    "flex w-full hover:bg-[#2a2d2e] transition-colors",
                                                    isTarget && "bg-[#37373d] ring-1 ring-[#007fd4]"
                                                )}
                                            >
                                                <div className="w-[50px] shrink-0 text-right pr-4 select-none text-[#858585] bg-[#1e1e1e] border-r border-[#404040]">
                                                    {lineNum}
                                                </div>
                                                <div className="pl-4 pr-4 whitespace-pre tab-4">
                                                    {lineText}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}

                            {!loading && !error && !content && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center">
                                    <FileCode className="w-12 h-12 opacity-50" />
                                    <h3 className="font-medium text-lg text-foreground">Unable to load file content</h3>
                                    <p className="max-w-sm text-sm">
                                        The file might be empty, inaccessible, or deleted. 
                                        You can try opening it in your external editor.
                                    </p>
                                    <div className="flex gap-2 mt-4">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => window.electron?.openPath(filePath, lineNumber, 'system')}
                                        >
                                            <ExternalLink className="w-4 h-4 mr-2" />
                                            Open Externally
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
