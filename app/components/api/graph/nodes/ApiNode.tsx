import React from 'react';
import { Handle, Position } from 'reactflow';
import { cn } from '@/lib/utils';

export function ApiNode({ data }: { data: { label: string; methods: string[] } }) {
  return (
    <div className="px-6 py-4 rounded-xl border-2 border-primary shadow-xl bg-card/95 backdrop-blur-sm">
      {/* Source handle */}
      <Handle 
        type="source" 
        position={Position.Right}
        style={{ 
          background: '#3b82f6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
      
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1">
          {data.methods.map(method => (
            <span 
              key={method}
              className={cn(
                'px-2 py-0.5 text-xs font-bold rounded',
                method === 'GET' && 'bg-green-500/20 text-green-600',
                method === 'POST' && 'bg-blue-500/20 text-blue-600',
                method === 'PUT' && 'bg-amber-500/20 text-amber-600',
                method === 'DELETE' && 'bg-red-500/20 text-red-600',
                method === 'PATCH' && 'bg-purple-500/20 text-purple-600',
              )}
            >
              {method}
            </span>
          ))}
        </div>
        <span className="font-mono text-sm font-semibold text-foreground">{data.label}</span>
      </div>
    </div>
  );
}
