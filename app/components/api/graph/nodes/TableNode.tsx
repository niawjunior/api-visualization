import React from 'react';
import { Handle, Position } from 'reactflow';
import { Database } from 'lucide-react';

export function TableNode({ data }: { data: { label: string } }) {
  return (
    <div className="rounded-lg border-2 border-emerald-500 shadow-lg overflow-hidden min-w-[140px] bg-card/95 backdrop-blur-sm">
      {/* Target handle */}
      <Handle 
        type="target" 
        position={Position.Left}
        style={{ 
          background: '#10b981',
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
      
      {/* Header */}
      <div className="bg-emerald-500 px-3 py-2 flex items-center gap-2">
        <Database className="w-3.5 h-3.5 text-white" />
        <span className="font-semibold text-xs text-white">{data.label}</span>
      </div>
      
      {/* Schema hint */}
      <div className="px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="font-mono">id</span>
          <span className="text-muted-foreground/50 ml-auto">PK</span>
        </div>
      </div>
    </div>
  );
}
