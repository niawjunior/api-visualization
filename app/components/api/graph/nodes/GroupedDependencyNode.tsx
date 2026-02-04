import React from 'react';
import { Handle, Position, useStore, ReactFlowState } from 'reactflow';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_CONFIG } from '../config';

export function GroupedDependencyNode({ data }: { 
  data: { 
    label: string; 
    type: string; 
    module: string;
    items: string[];
    count: number;
  } 
}) {
  // Optimization: Subscribe only to zoom changes for LOD
  const zoom = useStore((s: ReactFlowState) => s.transform[2]);
  const showDetails = zoom > 0.65; // Show functions only when zoomed in
  
  const config = CATEGORY_CONFIG[data.type as keyof typeof CATEGORY_CONFIG];
  const Icon = config?.icon || Layers;
  
  // Truncate very long lists for performance
  const MAX_VISIBLE_ITEMS = 12;
  const visibleItems = data.items.slice(0, MAX_VISIBLE_ITEMS);
  const remainingCount = data.items.length - MAX_VISIBLE_ITEMS;
  
  return (
    <div 
      className={cn(
        'rounded-lg border-2 shadow-lg min-w-[180px] overflow-hidden',
        'bg-card/95 backdrop-blur-sm transition-all duration-300', // Smother zoom transition
        config?.borderColor || 'border-border'
      )}
      style={{ borderColor: config?.color }}
    >
      {/* Target handle */}
      <Handle 
        type="target" 
        position={Position.Left}
        style={{ 
          background: config?.color || '#94a3b8',
          width: 10,
          height: 10,
          border: '2px solid white',
        }}
      />
      
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <div 
          className="p-1.5 rounded-md shrink-0"
          style={{ backgroundColor: `${config?.color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: config?.color }} />
        </div>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <div className="flex items-center gap-2 w-full">
            <span className="font-medium text-sm text-foreground truncate">{data.label}</span>
            <span 
              className="px-1.5 py-0.5 text-xs rounded-full font-medium shrink-0"
              style={{ backgroundColor: `${config?.color}20`, color: config?.color }}
            >
              {data.count}
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-full">{data.module}</span>
        </div>
      </div>
      
      {/* Function names - LOD: Only visible when zoomed in */}
      {showDetails && data.items.length > 0 && (
        <div className="border-t border-border/50 px-4 py-2 bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {visibleItems.map((item, i) => (
              <span 
                key={i} 
                className="px-1.5 py-0.5 text-[10px] font-mono rounded"
                style={{ backgroundColor: `${config?.color}15`, color: config?.color }}
              >
                {item}
              </span>
            ))}
            {remainingCount > 0 && (
               <span 
                className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground"
              >
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Source handle for connecting to tables */}
      <Handle 
        type="source" 
        position={Position.Right}
        style={{ 
          background: config?.color || '#94a3b8',
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
    </div>
  );
}
