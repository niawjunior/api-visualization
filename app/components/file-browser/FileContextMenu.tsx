'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Eye, ExternalLink, FileText, Box } from 'lucide-react';
import { FileEntry } from './FileExplorer';

interface FileContextMenuProps {
  contextMenu: { x: number; y: number; file: FileEntry } | null;
  onClose: () => void;
  onOpen: (file: FileEntry) => void;
  onReveal: (path: string) => void;
  onCopyPath: (path: string) => void;
  onQuickLook: (file: FileEntry) => void;
  onCalculateSize: (file: FileEntry) => void;
  selectedFiles: Set<string>;
  isImageFile: (name: string) => boolean;
}

export function FileContextMenu({
  contextMenu,
  onClose,
  onOpen,
  onReveal,
  onCopyPath,
  onQuickLook,
  onCalculateSize,
  selectedFiles,
  isImageFile
}: FileContextMenuProps) {
  
  return (
      <AnimatePresence>
          {contextMenu && (
              <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  style={{ 
                      top: Math.min(contextMenu.y, (window.innerHeight || 800) - 200), // increased height buffer
                      left: Math.min(contextMenu.x, (window.innerWidth || 1000) - 180) 
                  }}
                  className="fixed z-50 w-44 bg-popover border border-border rounded-lg shadow-lg overflow-hidden py-1"
                  onMouseLeave={onClose}
              >
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border mb-1 truncate">
                      {contextMenu.file.name}
                  </div>
                  <button onClick={() => { onOpen(contextMenu.file); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                       <ExternalLink className="w-3.5 h-3.5" /> Open
                  </button>
                  {isImageFile(contextMenu.file.name) && (
                      <button onClick={() => { onQuickLook(contextMenu.file); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                           <Eye className="w-3.5 h-3.5" /> Quick Look
                      </button>
                  )}
                  {contextMenu.file.isDirectory && (
                      <button onClick={() => { onCalculateSize(contextMenu.file); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                           <Box className="w-3.5 h-3.5" /> Calculate Size
                      </button>
                  )}
                  {/* Show in Finder removed/mocked */}
                  
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => { onCopyPath(contextMenu.file.path); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2">
                       <FileText className="w-3.5 h-3.5" /> Copy Path
                  </button>
                  {/* Removed destructive actions */}
              </motion.div>
          )}
      </AnimatePresence>
  );
}
