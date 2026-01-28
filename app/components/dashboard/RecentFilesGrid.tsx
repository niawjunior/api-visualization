'use client';

import { FileEntry } from '../file-browser/FileExplorer';
import { formatSize } from '../file-browser/FileEntryRow';
import { ImageThumbnail } from '../file-browser/ImageThumbnail';
import { Folder, File, FileText, Image as ImageIcon, Music, Video, Code, Box, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface RecentFilesGridProps {
  files: FileEntry[];
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
}

const getFileIcon = (name: string, isDirectory: boolean) => {
    if (isDirectory) return <Folder className="w-6 h-6 text-blue-500" />;
    
    const ext = name.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'svg':
        return <ImageIcon className="w-6 h-6 text-purple-500" />;
      case 'mp3': case 'wav': case 'aac': case 'flac':
        return <Music className="w-6 h-6 text-pink-500" />;
      case 'mp4': case 'mov': case 'avi': case 'mkv':
        return <Video className="w-6 h-6 text-red-500" />;
      case 'js': case 'ts': case 'tsx': case 'jsx': case 'json': case 'css': case 'html': case 'py': case 'go': case 'rs':
        return <Code className="w-6 h-6 text-amber-600" />;
      case 'pdf': case 'txt': case 'md': case 'doc': case 'docx':
        return <FileText className="w-6 h-6 text-gray-500" />;
      case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
        return <Box className="w-6 h-6 text-orange-500" />;
      default:
        return <File className="w-6 h-6 text-gray-400" />;
    }
};

const isImageFile = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
};

const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

export function RecentFilesGrid({ files, onNavigate, onOpen }: RecentFilesGridProps) {
  if (files.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-48 bg-card border border-border rounded-xl border-dashed">
              <Clock className="w-8 h-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No recent files</p>
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
        {files.map((file, idx) => (
            <motion.div
                key={file.path}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => {
                   if (file.isDirectory) onNavigate(file.path);
                   else onOpen(file.path);
                }}
                className="group relative bg-card hover:bg-muted/50 border border-border/60 hover:border-primary/30 rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-all shadow-sm hover:shadow-md"
            >
                {/* Icon / Thumbnail Box */}
                <div className="w-10 h-10 rounded-md bg-secondary/30 flex items-center justify-center shrink-0 overflow-hidden border border-border/50 group-hover:scale-105 transition-transform duration-300">
                    {isImageFile(file.name) ? (
                        <ImageThumbnail path={file.path} name={file.name} size={40} className="w-full h-full object-cover" />
                    ) : (
                        getFileIcon(file.name, file.isDirectory)
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">{file.name}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground group-hover:text-muted-foreground/80">
                        <span>{formatSize(file.size)}</span>
                        <span>•</span>
                        <span>{timeAgo(file.lastModified)}</span>
                    </div>
                </div>

                {/* Arrow hint */}
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300" />
            </motion.div>
        ))}
    </div>
  );
}
