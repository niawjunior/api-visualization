import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileCode, FileText, FileImage, FileJson, FileType } from 'lucide-react';
import { cn } from '@/lib/utils';

// Simplified interface to avoid circular deps if possible, or match FileEntry
interface FileNodeData {
  label: string;
  path: string;
  size?: number;
  extension?: string;
}

const getFileIcon = (ext?: string) => {
  const e = ext?.toLowerCase().replace('.', '');
  switch (e) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode size={16} className="text-blue-400" />;
    case 'css':
    case 'scss':
      return <FileText size={16} className="text-sky-300" />;
    case 'json':
      return <FileJson size={16} className="text-yellow-400" />;
    case 'png':
    case 'jpg':
    case 'svg':
    case 'gif':
      return <FileImage size={16} className="text-purple-400" />;
    default:
      return <FileType size={16} className="text-slate-400" />;
  }
};

const FileNode = ({ data, selected }: NodeProps<FileNodeData>) => {
  return (
    <div className={cn(
      "min-w-[160px] rounded-lg border border-border bg-card/80 shadow-sm transition-all duration-200 hover:shadow-md backdrop-blur-sm",
      "hover:border-primary/50",
      selected ? "border-primary ring-1 ring-primary" : ""
    )}>
      <Handle type="target" position={Position.Left} className="!bg-primary/50 w-2 h-2" />
      
      <div className="p-2 flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-secondary/50">
          {getFileIcon(data.extension)}
        </div>
        
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate text-foreground/80 font-mono">
            {data.label}
          </span>
          {data.size && (
             <span className="text-[9px] text-muted-foreground">
                {(data.size / 1024).toFixed(1)} KB
             </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-primary/50 w-2 h-2" />
    </div>
  );
};

export default memo(FileNode);
