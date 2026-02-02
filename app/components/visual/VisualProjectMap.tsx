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
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';



import FolderNode from './nodes/FolderNode';
import FileNode from './nodes/FileNode';
import { buildGraphFromFiles, getLayoutedElements } from './utils/graphBuilder';
import { VisualControls, ViewMode } from './VisualControls';
import { useDependencyGraph } from '../hooks/useDependencyGraph';
import { ApiExplorer } from '../api/ApiExplorer';
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
  const [viewMode, setViewMode] = useState<ViewMode>('structure');

  // Determine if we CAN show dependencies/api
  const canShowDependencies = detectedProject?.isProject && detectedProject?.type !== 'unknown';
  
  // Get the project root path (for dependency analysis)
  const projectRootPath = detectedProject?.path || currentPath;

  // Debug: Log path changes
  useEffect(() => {
    console.log('[VisualProjectMap] Paths changed:', {
      currentPath,
      projectRootPath,
      detectedProjectPath: detectedProject?.path,
      viewMode
    });
  }, [currentPath, projectRootPath, detectedProject?.path, viewMode]);

  // Reset viewMode when navigating to a non-project folder
  useEffect(() => {
    if (!canShowDependencies) {
      setViewMode('structure');
    }
  }, [canShowDependencies]);

  // Clear graph when current path changes (force refresh)
  useEffect(() => {
    console.log('[VisualProjectMap] Path changed, clearing graph');
    setNodes([]);
    setEdges([]);
  }, [currentPath, setNodes, setEdges]);

  // Use dependency graph hook with CURRENT PATH (updates when navigating folders)
  const { 
    nodes: depNodes, 
    edges: depEdges, 
    isLoading: isLoadingDeps 
  } = useDependencyGraph({ 
    currentPath: currentPath, // Use current path - updates when navigating
    enabled: viewMode === 'dependencies' && !!canShowDependencies 
  });

  // Structure Mode: Build graph from files
  useEffect(() => {
    if (viewMode !== 'structure' || !files || !currentPath) return;

    const { nodes: newNodes, edges: newEdges } = buildGraphFromFiles(files, currentPath);
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [files, currentPath, viewMode, setNodes, setEdges]);

  // Dependency Mode: Use nodes/edges from hook
  useEffect(() => {
    if (viewMode !== 'dependencies' || !canShowDependencies) return;
    if (depNodes.length > 0 || depEdges.length > 0) {
      setNodes(depNodes);
      setEdges(depEdges);
    }
  }, [viewMode, canShowDependencies, depNodes, depEdges, setNodes, setEdges]);

  // Filter Nodes by search
  useEffect(() => {
    if (viewMode === 'api') return; // Don't filter in API mode
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
  }, [searchQuery, setNodes, viewMode]);

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

  const { setCenter } = useReactFlow(); // Hook for navigation

  // API Mode: Render ApiExplorer instead of ReactFlow (full-screen, seamless)
  if (viewMode === 'api') {
    return (
      <div className="w-full h-full bg-background relative">
        {/* Compact Mode Toggle - top right */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 p-2 bg-card/90 backdrop-blur-sm border border-border rounded-lg shadow-sm">
          <button
            onClick={() => setViewMode('structure')}
            className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            Structure
          </button>
          {canShowDependencies && (
            <button
              onClick={() => setViewMode('dependencies')}
              className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Deps
            </button>
          )}
          <span className="px-2.5 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md">
            API
          </span>
        </div>
        
        {/* Full-screen ApiExplorer */}
        <ApiExplorer 
          currentPath={projectRootPath}
          onOpenFile={onOpenFile}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 relative group">
      <VisualControls 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        detectedProject={detectedProject}
        canShowDependencies={!!canShowDependencies}
        viewMode={viewMode}
        setViewMode={setViewMode}
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
        attributionPosition="bottom-left"
        selectionMode={SelectionMode.Partial}
        minZoom={0.1}
      >
        <Background gap={20} size={1} color="#94a3b8" />
        <Controls position="top-left" className="bg-white dark:bg-slate-900 border-border fill-foreground text-foreground shadow-sm mt-4 ml-4" />
        <MiniMap 
          zoomable
          nodeColor={(node) => node.type === 'folder' ? '#3b82f6' : '#cbd5e1'}
          className="!bg-white dark:!bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md" 
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{ pointerEvents: 'all', zIndex: 100, cursor: 'pointer' }}
          onClick={(_, target) => {
              setCenter(target.x, target.y, { duration: 800, zoom: 1.2 });
          }}
          onNodeClick={(_, node) => {
              setCenter(node.position.x, node.position.y, { duration: 800, zoom: 1.2 });
          }}
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

