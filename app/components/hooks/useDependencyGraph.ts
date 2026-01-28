'use client';

import { useState, useEffect } from 'react';
import { Node, Edge, MarkerType } from 'reactflow';
import { getLayoutedElements } from '../visual/utils/graphBuilder';

interface UseDependencyGraphOptions {
  currentPath: string;
  enabled: boolean;
}

/**
 * Hook for loading and managing the dependency graph
 * @param options - Configuration options
 * @returns Object containing nodes, edges, loading state, and error
 */
export function useDependencyGraph({ currentPath, enabled }: UseDependencyGraphOptions) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !currentPath) {
      setNodes([]);
      setEdges([]);
      return;
    }

    let isMounted = true;

    const loadDependencies = async () => {
      setIsLoading(true);
      setError(null);
      setNodes([]);
      setEdges([]);

      try {
        const { nodes: depNodes, edges: depEdges } = await window.electron.analyzeDependencies(currentPath);

        if (!isMounted) return;

        // Transform to React Flow nodes
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

        // Transform to React Flow edges
        const flowEdges: Edge[] = depEdges.map((e: any, i: number) => ({
          id: `e-${e.source}-${e.target}-${i}`,
          source: e.source,
          target: e.target,
          type: 'default',
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2, opacity: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
        }));

        // Apply layout
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges, 'LR');

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } catch (e: any) {
        console.error('Dependency analysis failed:', e);
        setError(e.message || 'Failed to analyze dependencies');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDependencies();

    return () => {
      isMounted = false;
    };
  }, [currentPath, enabled]);

  return { nodes, edges, isLoading, error };
}
