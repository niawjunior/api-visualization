import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Folder, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils'; 

interface FolderNodeData {
  label: string;
  path: string;
  childCount?: number;
  expanded?: boolean;
  onExpand?: (path: string) => void;
  isRoot?: boolean;
  color?: string; 
}

const FolderNode = ({ data, selected }: NodeProps<FolderNodeData>) => {
  // Determine color theme
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 text-blue-500 bg-blue-500/10',
    emerald: 'border-emerald-500 text-emerald-500 bg-emerald-500/10',
    amber: 'border-amber-500 text-amber-500 bg-amber-500/10',
    indigo: 'border-indigo-500 text-indigo-500 bg-indigo-500/10',
    slate: 'border-slate-500 text-slate-500 bg-slate-500/10',
    rose: 'border-rose-500 text-rose-500 bg-rose-500/10',
  };

  const themeClass = colorMap[data.color || 'blue'] || colorMap.blue;
  const isRoot = data.isRoot;

  return (
    <div className={cn(
      "min-w-[180px] rounded-xl border-2 shadow-lg transition-all duration-200 backdrop-blur-md bg-card/90",
      themeClass,
      selected ? "ring-2 ring-white/50 scale-105" : "",
      "group relative"
    )}>
      <Handle type="target" position={Position.Left} className="!bg-current border-2 border-background w-3 h-3" />
      
      <div className="p-3 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-background/50", data.color ? `text-${data.color}-500` : "text-blue-500")}>
           <Folder size={20} fill="currentColor" className="opacity-20 translate-y-[1px] absolute" />
           <Folder size={20} className="relative z-10" />
        </div>
        
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm truncate leading-tight text-foreground/90 font-mono">
            {data.label}
          </span>
          {data.childCount !== undefined && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {data.childCount} items
            </span>
          )}
        </div>

        {!isRoot && (
            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={16} className="text-muted-foreground" />
            </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-current border-2 border-background w-3 h-3" />
    </div>
  );
};

export default memo(FolderNode);
