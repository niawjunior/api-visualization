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
  useStore,
  ReactFlowState,
  useReactFlow,
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
  tables?: string[];
  apiCalls?: string[];
}

interface EndpointSummary {
  path: string;
  methods: string[];
  filePath?: string;
  dependencies?: ApiDependencies;
}

interface ApiDependencyGraphProps {
  endpoint: EndpointSummary;
  allEndpoints?: EndpointSummary[];  // For cross-referencing shared dependencies
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
// Grouped Dependency Node (Collapsible with LOD)
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
  table: TableNode,
};

// ============================================================================
// Table Node (Schema-style)
// ============================================================================

function TableNode({ data }: { data: { label: string } }) {
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
  
  // Track database dependency nodes for connecting tables
  const databaseNodeIds: string[] = [];
  
  grouped.forEach((group, idx) => {
    const id = `group-${idx}`;
    const angle = startAngle + (idx * angleStep);
    const radian = (angle * Math.PI) / 180;
    
    const x = 200 + radius * Math.cos(radian);
    const y = 200 + radius * Math.sin(radian);
    
    // Track database nodes
    if (group.type === 'database') {
      databaseNodeIds.push(id);
    }
    
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
  
  // Add table nodes connected to database dependencies
  const tables = deps.tables || [];
  const tableSpacingY = 90; // Vertical spacing between tables
  const tableOffsetX = 220; // Horizontal offset from database node
  
  tables.forEach((table, idx) => {
    const tableId = `table-${idx}`;
    
    // Find the first database node to connect to
    const dbNodeId = databaseNodeIds[0] || 'api';
    const dbNode = nodes.find(n => n.id === dbNodeId);
    
    if (dbNode) {
      // Position tables in a vertical stack to the right of database node
      // Center the stack vertically around the database node
      const totalHeight = (tables.length - 1) * tableSpacingY;
      const startY = dbNode.position.y - totalHeight / 2;
      
      const x = dbNode.position.x + tableOffsetX;
      const y = startY + (idx * tableSpacingY);
      
      nodes.push({
        id: tableId,
        type: 'table',
        position: { x, y },
        data: { label: table },
      });
      
      // Connect to database dependency
      edges.push({
        id: `edge-${tableId}`,
        source: dbNodeId,
        target: tableId,
        animated: false,
        style: { 
          stroke: '#10b981',
          strokeWidth: 1.5,
          strokeDasharray: '5,5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#10b981',
        },
      });
    }
  });
  
  return { nodes, edges };
}

// ============================================================================
// Main Component
// ============================================================================

function ApiDependencyGraphContent({ endpoint, allEndpoints = [], onClose, onOpenFile }: ApiDependencyGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(endpoint),
    [endpoint]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  
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
  
  // Find endpoints that share the selected module
  const sharedEndpoints = useMemo(() => {
    if (!selectedModule) return [];
    
    return allEndpoints.filter(ep => {
      if (ep.path === endpoint.path) return false; // Exclude current endpoint
      const epGrouped = ep.dependencies?.grouped || [];
      return epGrouped.some(g => g.module === selectedModule);
    });
  }, [selectedModule, allEndpoints, endpoint.path]);
  
  // Handle node click to show shared dependencies
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'dependency') {
      const module = node.data?.module || null;
      setSelectedModule(prev => prev === module ? null : module);
    }
  }, []);
  
  const { setCenter } = useReactFlow();

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
        
        {/* API Calls (tables are now shown as nodes) */}
        {deps?.apiCalls && deps.apiCalls.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium">Internal API Calls:</span>
              <div className="flex gap-1 flex-wrap">
                {deps.apiCalls.map((api, i) => (
                  <span 
                    key={i}
                    className="px-2 py-0.5 text-xs bg-amber-500/10 text-amber-600 rounded font-mono"
                  >
                    {api}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Graph */}
      <div className={cn("w-full h-full pt-24", selectedModule && "pr-80")}>
        {hasDependencies ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
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
      
      {/* Shared Dependencies Sidebar */}
      <AnimatePresence>
        {selectedModule && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            className="absolute top-0 right-0 w-80 h-full bg-card border-l border-border shadow-2xl z-20 pt-24 overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Shared Dependencies</h3>
                <button
                  onClick={() => setSelectedModule(null)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <code className="text-xs px-2 py-1 bg-muted rounded block truncate">
                {selectedModule}
              </code>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {sharedEndpoints.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    {sharedEndpoints.length} other endpoint{sharedEndpoints.length > 1 ? 's' : ''} using this dependency:
                  </p>
                  {sharedEndpoints.map((ep, index) => (
                    <button
                      key={index}
                      onClick={() => onOpenFile?.(ep.filePath || '')}
                      className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        {ep.methods.slice(0, 3).map(method => (
                          <span 
                            key={method}
                            className={cn(
                              'px-1.5 py-0.5 text-[10px] font-bold rounded',
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
                      <span className="font-mono text-xs text-foreground">{ep.path}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No other endpoints</p>
                  <p className="text-xs mt-1">This is the only API using this dependency.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
