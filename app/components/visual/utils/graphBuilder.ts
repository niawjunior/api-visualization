import { Node, Edge, Position } from 'reactflow';
import dagre from 'dagre';
import { FileEntry } from '../../file-browser/FileExplorer';

// Colors for special folders
const FOLDER_COLORS: Record<string, string> = {
  src: 'blue',
  app: 'blue',
  components: 'emerald',
  api: 'amber',
  hooks: 'indigo',
  utils: 'slate',
  lib: 'slate',
  styles: 'rose',
  public: 'green',
  assets: 'rose',
};

export const getFolderColor = (name: string) => {
  return FOLDER_COLORS[name.toLowerCase()] || 'slate';
};

const nodeWidth = 220;
const nodeHeight = 80;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ 
    rankdir: direction, 
    ranksep: 100, // Increase vertical spacing between ranks
    nodesep: 80   // Increase horizontal spacing between nodes
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = direction === 'LR' ? Position.Left : Position.Top;
    node.sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;

    // Shift the dagre node position (anchor=center) to React Flow (anchor=top left)
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes: newNodes, edges };
};

/**
 * Converts a flat list of files (current directory) into a Root -> Children graph.
 * 
 * @param files The list of files in the current directory
 * @param currentPath The absolute path of the current directory
 */
export const buildGraphFromFiles = (files: FileEntry[], currentPath: string): { nodes: Node[], edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. Create Root Node (Current Directory)
  const rootId = 'root';
  const rootLabel = currentPath.split(/[/\\]/).pop() || 'Project';
  
  nodes.push({
    id: rootId,
    type: 'folder',
    data: { 
      label: rootLabel, 
      path: currentPath,
      isRoot: true,
      color: 'blue' 
    },
    position: { x: 0, y: 0 },
  });

  // 2. Create nodes for children
  files.forEach((file) => {
    const nodeId = file.path; // Use absolute path as ID
    
    if (file.isDirectory) {
      nodes.push({
        id: nodeId,
        type: 'folder',
        data: {
          label: file.name,
          path: file.path,
          childCount: file.childCount,
          color: getFolderColor(file.name),
        },
        position: { x: 0, y: 0 }, // Will be set by dagre
      });
    } else {
      nodes.push({
        id: nodeId,
        type: 'file',
        data: {
          label: file.name,
          path: file.path,
          size: file.size,
          extension: file.name.split('.').pop(),
        },
        position: { x: 0, y: 0 },
      });
    }

    // Edge from Root to Child
    edges.push({
      id: `e-${rootId}-${nodeId}`,
      source: rootId,
      target: nodeId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#475569', strokeWidth: 1.5 },
    });
  });

  // Apply Layout
  return getLayoutedElements(nodes, edges);
};
