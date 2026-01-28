'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  ReactFlowProvider,
  NodeTypes,
  SelectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

import FolderNode from './nodes/FolderNode';
import FileNode from './nodes/FileNode';
import { buildGraphFromFiles, getLayoutedElements } from './utils/graphBuilder';
import { VisualControls } from './VisualControls';
import { useDependencyGraph } from '../hooks/useDependencyGraph';
import type { DetectedProject, FileEntry } from '@/lib/types';

// --- Props ---
interface VisualProjectMapProps {
  files: FileEntry[];
  currentPath: string;
  detectedProject: DetectedProject | null;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
}

// --- Node Types ---
const nodeTypes: NodeTypes = {
  folder: FolderNode,
  file: FileNode,
};

function VisualProjectMapContent({ files, currentPath, detectedProject, onNavigate, onOpenFile }: VisualProjectMapProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDependencies, setShowDependencies] = useState(false);

  // Determine if we CAN show dependencies
  const canShowDependencies = detectedProject?.isProject && detectedProject?.type !== 'unknown';

  // Use dependency graph hook
  const { 
    nodes: depNodes, 
    edges: depEdges, 
    isLoading: isLoadingDeps 
  } = useDependencyGraph({ 
    currentPath, 
    enabled: showDependencies && !!canShowDependencies 
  });

  // Structure Mode: Build graph from files
  useEffect(() => {
    if (showDependencies || !files || !currentPath) return;

    const { nodes: newNodes, edges: newEdges } = buildGraphFromFiles(files, currentPath);
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [files, currentPath, showDependencies, setNodes, setEdges]);

  // Dependency Mode: Use nodes/edges from hook
  useEffect(() => {
    if (!showDependencies || !canShowDependencies) return;
    setNodes(depNodes);
    setEdges(depEdges);
  }, [showDependencies, canShowDependencies, depNodes, depEdges, setNodes, setEdges]);

  // Filter Nodes by search
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (!searchQuery) {
          return { ...node, style: { ...node.style, opacity: 1 } };
        }
        const label = (node.data.label as string).toLowerCase();
        const isMatch = label.includes(searchQuery.toLowerCase());
        return {
          ...node,
          style: { ...node.style, opacity: isMatch ? 1 : 0.2 },
        };
      })
    );
  }, [searchQuery, setNodes]);

  // Node click handlers
  const onNodeClick = useCallback(() => {}, []);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'folder' && !node.data.isRoot) {
      setSearchQuery('');
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
        detectedProject={detectedProject}
        canShowDependencies={!!canShowDependencies}
        showDependencies={showDependencies}
        setShowDependencies={setShowDependencies}
      />
      {isLoadingDeps && (
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
          nodeColor={(node) => node.type === 'folder' ? '#3b82f6' : '#cbd5e1'}
          className="!bg-white dark:!bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md" 
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}

export default function VisualProjectMap(props: VisualProjectMapProps) {
  return (
    <ReactFlowProvider>
      <VisualProjectMapContent {...props} />
    </ReactFlowProvider>
  );
}
