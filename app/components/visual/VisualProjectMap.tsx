'use client';

import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ReactFlowProvider,
  NodeTypes,
  SelectionMode,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import FolderNode from './nodes/FolderNode';
import FileNode from './nodes/FileNode';
import { buildGraphFromFiles, getLayoutedElements } from './utils/graphBuilder';
import { FileEntry } from '../file-browser/FileExplorer';

import { VisualControls } from './VisualControls';

// --- Types ---
interface VisualProjectMapProps {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
}

// --- Icons / Styles ---
const nodeTypes: NodeTypes = {
  folder: FolderNode,
  file: FileNode,
};

function VisualProjectMapContent({ files, currentPath, onNavigate, onOpenFile }: VisualProjectMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [graphMode, setGraphMode] = React.useState<'structure' | 'dependency'>('structure');
  const [isLoadingProps, setIsLoadingProps] = React.useState(false);

  // Re-build graph when files or path changes (Structure Mode)
  useEffect(() => {
    if (graphMode !== 'structure' || !files || !currentPath) return;

    const { nodes: newNodes, edges: newEdges } = buildGraphFromFiles(files, currentPath);
    // Apply layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [files, currentPath, graphMode, setNodes, setEdges]);

  // Load Dependencies (Dependency Mode)
  useEffect(() => {
    if (graphMode !== 'dependency' || !currentPath) return;

    let isMounted = true;
    const loadDeps = async () => {
        setIsLoadingProps(true);
        setNodes([]); // Clear previous nodes to avoid confusion
        setEdges([]);
        try {
            // Use API Route instead of Electron IPC
            const response = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: currentPath }),
            });
            const { nodes: depNodes, edges: depEdges } = await response.json();

            if (!isMounted) return;

             const flowNodes: Node[] = depNodes.map((n: any) => ({
                  id: n.id,
                  type: 'file', 
                  data: { 
                      label: n.label, 
                      path: n.id, 
                      extension: n.label.split('.').pop(),
                      isExternal: n.isExternal
                  },
                  position: { x: 0, y: 0 },
                  style: n.isExternal ? { opacity: 0.6, borderStyle: 'dashed' } : undefined
              }));

              const flowEdges: Edge[] = depEdges.map((e: any, i: number) => ({
                  id: `e-${e.source}-${e.target}-${i}`,
                  source: e.source,
                  target: e.target,
                  type: 'default',
                  animated: true,
                  style: { stroke: '#64748b', strokeWidth: 2, opacity: 1 },
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
              }));

              const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges, 'LR');
              
              setNodes(layoutedNodes);
              setEdges(layoutedEdges);
        } catch (e) {
            console.error(e);
        } finally {
            if (isMounted) setIsLoadingProps(false);
        }
    };
    
    loadDeps();
    return () => { isMounted = false; };
  }, [currentPath, graphMode, setNodes, setEdges]);

  // Filter Nodes (Visual Only)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        // If search is empty, show everything fully
        if (!searchQuery) {
          return { ...node, style: { ...node.style, opacity: 1 } };
        }

        // Check if node matches query
        const label = (node.data.label as string).toLowerCase();
        const query = searchQuery.toLowerCase();
        const isMatch = label.includes(query);

        return {
          ...node,
          style: {
            ...node.style,
            opacity: isMatch ? 1 : 0.2, // Fade out non-matches
          },
        };
      })
    );
  }, [searchQuery, setNodes]);

  // Handle Node Click
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        // Optional click handler
    }, []);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'folder' && !node.data.isRoot) {
        setSearchQuery(''); // Clear search on navigation
        onNavigate(node.data.path);
    } else if (node.type === 'file') {
       onOpenFile(node.data.path);
    }
  }, [onNavigate, onOpenFile]);

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 relative group">
      <VisualControls 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        graphMode={graphMode}
        setGraphMode={setGraphMode}
      />
      {isLoadingProps && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-background/80 backdrop-blur rounded-full shadow border border-border flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Analyzing dependencies...</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        attributionPosition="bottom-right"
        selectionMode={SelectionMode.Partial}
        minZoom={0.1}
      >
        <Background gap={20} size={1} color="#94a3b8" />
        <Controls className="bg-white dark:bg-slate-900 border-border fill-foreground text-foreground shadow-sm" />
        <MiniMap 
            nodeColor={(node) => {
                if (node.type === 'folder') return '#3b82f6';
                return '#cbd5e1'; 
            }}
            className="!bg-white dark:!bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md override-minimap" 
            maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}

// Wrapper with Provider is best practice
export default function VisualProjectMap(props: VisualProjectMapProps) {
  return (
    <ReactFlowProvider>
      <VisualProjectMapContent {...props} />
    </ReactFlowProvider>
  );
}
