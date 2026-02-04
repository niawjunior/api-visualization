import { Node, Edge, MarkerType, Position } from 'reactflow';
import { EndpointSummary } from './types';
import { CATEGORY_CONFIG } from './config';

export function buildGraph(endpoint: EndpointSummary): { nodes: Node[]; edges: Edge[] } {
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
    
    const config = CATEGORY_CONFIG[group.type as keyof typeof CATEGORY_CONFIG];
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
