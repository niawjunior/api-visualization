import { Node, Edge, MarkerType, Position } from 'reactflow';
import { LocalApiEndpoint } from './types';
import { CATEGORY_CONFIG } from './config';

import dagre from 'dagre';

export function buildGraph(endpoint: LocalApiEndpoint): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  const deps = endpoint.dependencies;
  if (!deps) return { nodes: [], edges: [] };
  
  const grouped = deps.grouped || [];
  const tables = deps.tables || [];
  
  if (grouped.length === 0 && tables.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Create a dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({ 
    rankdir: 'LR', 
    align: 'DL', 
    ranksep: 180, // Increased from 100 for more horizontal breathing room
    nodesep: 60   // Increased from 50
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Helper to add node to graph and dagre
  const addNode = (id: string, width: number, height: number) => {
    g.setNode(id, { width, height });
  };

  // 1. API Node (Root)
  // Estimate width based on path length (approx 9px per char + padding)
  const apiLabelLength = endpoint.path.length;
  const apiNodeWidth = Math.max(300, apiLabelLength * 10 + 60); 
  
  addNode('api', apiNodeWidth, 100); // Increased height slighty to be safe
  nodes.push({
    id: 'api',
    type: 'api',
    data: { label: endpoint.path, methods: endpoint.methods },
    position: { x: 0, y: 0 }, // Position calculated later
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });

  // 2. Dependencies
  grouped.forEach((group, idx) => {
    const id = `group-${idx}`;
    addNode(id, 250, 80);
    
    nodes.push({
      id,
      type: 'dependency',
      data: { 
        label: group.moduleLabel, 
        type: group.type,
        module: group.module,
        items: group.items,
        count: group.count,
      },
      position: { x: 0, y: 0 },
    });

    const config = CATEGORY_CONFIG[group.type as keyof typeof CATEGORY_CONFIG];
    const edgeId = `edge-${id}`;
    
    edges.push({
      id: edgeId,
      source: 'api',
      target: id,
      animated: true,
      style: { stroke: config?.color || '#94a3b8', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: config?.color || '#94a3b8' },
    });
    
    g.setEdge('api', id);
  });

  // 3. Tables (connected to Database dependencies)
  const databaseGroups = grouped
    .map((g, i) => ({ ...g, id: `group-${i}` }))
    .filter(g => g.type === 'database');

  tables.forEach((table, idx) => {
    const tableId = `table-${idx}`;
    addNode(tableId, 200, 60);

    nodes.push({
      id: tableId,
      type: 'table',
      data: { label: table },
      position: { x: 0, y: 0 },
    });

    // Connect to specific DB group if possible, else first one, else API
    // Using module matching for smarter linking if possible, otherwise first DB node
    let targetSource = databaseGroups.length > 0 ? databaseGroups[0].id : 'api';
    
    // Simple heuristic: if table name is in a db group label, connect to it?
    // For now, just connect to the first database node to keep it simple but structured
    
    const edgeId = `edge-${tableId}`;
    edges.push({
      id: edgeId,
      source: targetSource,
      target: tableId,
      animated: false,
      style: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '5,5' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
    });

    g.setEdge(targetSource, tableId);
  });

  // Run layout
  dagre.layout(g);

  // Apply positions back to nodes
  nodes.forEach((node) => {
    const nodeWithPos = g.node(node.id);
    // React Flow anchors are top-left, Dagre anchors are center
    node.position = {
      x: nodeWithPos.x - nodeWithPos.width / 2,
      y: nodeWithPos.y - nodeWithPos.height / 2,
    };
  });

  return { nodes, edges };
}
