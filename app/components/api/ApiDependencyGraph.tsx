'use client';

import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import { X, Globe, Layers, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// Graph Components
import { CATEGORY_CONFIG } from './graph/config';
import { ApiNode } from './graph/nodes/ApiNode';
import { GroupedDependencyNode } from './graph/nodes/GroupedDependencyNode';
import { TableNode } from './graph/nodes/TableNode';
import { buildGraph } from './graph/utils';
import { ApiDependencyGraphProps } from './graph/types';

const nodeTypes = {
  api: ApiNode,
  dependency: GroupedDependencyNode,
  table: TableNode,
};

function ApiDependencyGraphContent({ endpoint, onClose, onOpenFile }: ApiDependencyGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(endpoint),
    [endpoint]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const deps = endpoint.dependencies;
  const grouped = deps?.grouped || [];
  const hasDependencies = grouped.length > 0;
  
  // Count by type
  const countByType = useMemo(() => {
    const counts = { service: 0, database: 0, external: 0, utility: 0 };
    grouped.forEach(g => {
      if (counts[g.type] !== undefined) {
        counts[g.type as keyof typeof counts] += g.count;
      }
    });
    return counts;
  }, [grouped]);

  const { setCenter } = useReactFlow();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 md:px-6 py-4 border-b border-border bg-card/95 backdrop-blur-md shadow-sm transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold shrink-0">API Dependencies</h2>
            <code 
              className="px-3 py-1.5 bg-muted/50 border border-border/50 rounded-lg font-mono text-xs md:text-sm truncate max-w-[200px] md:max-w-[400px]"
              title={endpoint.path}
            >
              {endpoint.path}
            </code>
            {onOpenFile && endpoint.filePath && (
              <button
                onClick={() => onOpenFile(endpoint.filePath!)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-md transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span className="hidden sm:inline">Open Source</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 md:static p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const count = countByType[key as keyof typeof countByType] || 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-sm shadow-sm"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-xs md:text-sm text-muted-foreground font-medium">
                  {config.label} <span className="text-foreground/80">({count})</span>
                </span>
              </div>
            );
          })}
        </div>
        
        {/* API Calls (tables are now shown as nodes) */}
        {deps?.apiCalls && deps.apiCalls.length > 0 && (
          <div className="flex flex-wrap items-start md:items-center gap-3 mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 shrink-0 text-amber-600/90">
              <Globe className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Internal Calls:</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {deps.apiCalls.map((api, i) => (
                <span 
                  key={i}
                  className="px-2 py-0.5 text-[10px] md:text-xs bg-amber-500/10 text-amber-700 border border-amber-500/20 rounded-md font-mono"
                  title={api}
                >
                  {api}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Graph */}
      <div className="w-full h-full pt-24">
        {hasDependencies ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background gap={24} size={1} color="#94a3b8" />
            <Controls position="top-left" className="bg-card border-border shadow-lg mt-24" />
            <MiniMap 
              zoomable
              ariaLabel="API Dependency MiniMap"
              maskColor="rgba(0, 0, 0, 0.1)"
              nodeColor={(node) => {
                if (node.type === 'api') return '#3b82f6';
                const type = node.data?.type as keyof typeof CATEGORY_CONFIG;
                return CATEGORY_CONFIG[type]?.color || '#94a3b8';
              }}
              style={{ pointerEvents: 'all', zIndex: 100, cursor: 'pointer' }}
              className="!bg-card border border-border rounded-lg shadow-lg"
              onClick={(_, target) => {
                  setCenter(target.x, target.y, { duration: 800, zoom: 1.2 });
              }}
              onNodeClick={(_, node) => {
                  setCenter(node.position.x, node.position.y, { duration: 800, zoom: 1.2 });
              }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="p-4 rounded-full bg-muted/50 mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <p className="text-lg font-medium">No dependencies detected</p>
            <p className="text-sm mt-1">This endpoint doesn't import any tracked services, databases, or utilities.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ApiDependencyGraph(props: ApiDependencyGraphProps) {
  return (
    <ReactFlowProvider>
      <ApiDependencyGraphContent {...props} />
    </ReactFlowProvider>
  );
}
