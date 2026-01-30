'use client';

import React, { useMemo, useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ReactFlowProvider,
  MarkerType,
  Position,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Database, Globe, Wrench, Layers, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface GroupedDependency {
  module: string;
  moduleLabel: string;
  type: 'service' | 'database' | 'external' | 'utility';
  items: string[];
  count: number;
}

interface ApiDependencies {
  services: any[];
  database: any[];
  external: any[];
  utilities: any[];
  grouped?: GroupedDependency[];
}

interface ApiDependencyGraphProps {
  endpoint: {
    path: string;
    methods: string[];
    filePath?: string;
    dependencies?: ApiDependencies;
  };
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

// ============================================================================
// Node Configuration
// ============================================================================

const CATEGORY_CONFIG = {
  service: {
    color: '#3b82f6', // blue
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: Layers,
    label: 'Services',
  },
  database: {
    color: '#10b981', // green
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    icon: Database,
    label: 'Database',
  },
  external: {
    color: '#f59e0b', // amber
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: Globe,
    label: 'External APIs',
  },
  utility: {
    color: '#8b5cf6', // purple
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: Wrench,
    label: 'Utilities',
  },
};

// ============================================================================
// Grouped Dependency Node (Collapsible)
// ============================================================================

function GroupedDependencyNode({ data }: { 
  data: { 
    label: string; 
    type: string; 
    module: string;
    items: string[];
    count: number;
  } 
}) {
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[data.type as keyof typeof CATEGORY_CONFIG];
  const Icon = config?.icon || Layers;
  
  return (
    <div 
      className={cn(
        'rounded-lg border-2 shadow-lg min-w-[180px] overflow-hidden',
        'bg-card/95 backdrop-blur-sm transition-all',
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
      
      {/* Header - Clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-muted/50 transition-colors"
      >
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
        {data.count > 1 && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </button>
      
      {/* Expanded items */}
      {expanded && data.items.length > 1 && (
        <div className="border-t border-border/50 px-4 py-2 bg-muted/30">
          <div className="text-xs text-muted-foreground space-y-1">
            {data.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full" style={{ backgroundColor: config?.color }} />
                <span className="font-mono">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApiNode({ data }: { data: { label: string; methods: string[] } }) {
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

const nodeTypes = {
  api: ApiNode,
  dependency: GroupedDependencyNode,
};

// ============================================================================
// Graph Builder - Using Grouped Dependencies
// ============================================================================

function buildGraph(endpoint: ApiDependencyGraphProps['endpoint']): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  const deps = endpoint.dependencies;
  if (!deps) return { nodes: [], edges: [] };
  
  // Use grouped if available, fallback to building from flat arrays
  const grouped = deps.grouped || [];
  
  if (grouped.length === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Central API node
  nodes.push({
    id: 'api',
    type: 'api',
    position: { x: 200, y: 200 },
    data: { label: endpoint.path, methods: endpoint.methods },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });
  
  // Radial layout for grouped dependencies
  const radius = 320;
  const angleStep = 100 / Math.max(grouped.length, 1);
  const startAngle = -50;
  
  grouped.forEach((group, idx) => {
    const id = `group-${idx}`;
    const angle = startAngle + (idx * angleStep);
    const radian = (angle * Math.PI) / 180;
    
    const x = 200 + radius * Math.cos(radian);
    const y = 200 + radius * Math.sin(radian);
    
    nodes.push({
      id,
      type: 'dependency',
      position: { x, y },
      data: { 
        label: group.moduleLabel, 
        type: group.type,
        module: group.module,
        items: group.items,
        count: group.count,
      },
    });
    
    const config = CATEGORY_CONFIG[group.type];
    edges.push({
      id: `edge-${id}`,
      source: 'api',
      target: id,
      animated: true,
      style: { 
        stroke: config?.color || '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: config?.color || '#94a3b8',
      },
    });
  });
  
  return { nodes, edges };
}

// ============================================================================
// Main Component
// ============================================================================

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
        counts[g.type] += g.count;
      }
    });
    return counts;
  }, [grouped]);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">API Dependencies</h2>
            <code className="px-3 py-1.5 bg-muted rounded-lg font-mono text-sm">
              {endpoint.path}
            </code>
            {onOpenFile && endpoint.filePath && (
              <button
                onClick={() => onOpenFile(endpoint.filePath!)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-md transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open Source
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-6 mt-3">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const count = countByType[key as keyof typeof countByType] || 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {config.label} ({count})
                </span>
              </div>
            );
          })}
        </div>
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
            attributionPosition="bottom-right"
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background gap={24} size={1} color="#94a3b8" />
            <Controls className="bg-card border-border shadow-lg" />
            <MiniMap 
              nodeColor={(node) => {
                if (node.type === 'api') return '#3b82f6';
                const type = node.data?.type as keyof typeof CATEGORY_CONFIG;
                return CATEGORY_CONFIG[type]?.color || '#94a3b8';
              }}
              className="!bg-card border border-border rounded-lg shadow-lg"
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
