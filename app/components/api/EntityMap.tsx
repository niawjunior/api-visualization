'use client';

import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, Node, Edge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { LocalApiEndpoint } from './types';
import { Loader2, Database, Network } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EntityMapProps {
    currentPath: string;
    onOpenFile?: (path: string, line?: number, app?: string) => void;
    headerRight?: React.ReactNode;
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 200 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 250, height: 80 });
    });
    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = isHorizontal ? 'left' as any : 'top' as any;
        node.sourcePosition = isHorizontal ? 'right' as any : 'bottom' as any;
        node.position = {
            x: nodeWithPosition.x - 250 / 2,
            y: nodeWithPosition.y - 80 / 2,
        };
    });

    return { nodes, edges };
};

export function EntityMap({ currentPath, onOpenFile, headerRight }: EntityMapProps) {
    const [endpoints, setEndpoints] = useState<LocalApiEndpoint[]>([]);
    const [loading, setLoading] = useState(false);
    
    const [filterValue, setFilterValue] = useState<string>('all');
    
    // Load endpoints similar to ApiExplorer
    useEffect(() => {
        if (!currentPath || !window.electron) return;
        
        const load = async () => {
            setLoading(true);
            try {
                let result;
                if (currentPath.startsWith('http://') || currentPath.startsWith('https://') || currentPath.endsWith('.json')) {
                    result = await window.electron.analyzeOpenAPI(currentPath);
                } else {
                    result = await window.electron.analyzeApiEndpoints(currentPath);
                }
                if (result.success) setEndpoints(result.endpoints);
            } catch (e: any) {} finally {
                setLoading(false);
            }
        };
        load();
    }, [currentPath]);

    const filterOptions = useMemo(() => {
        if (!endpoints.length) return { models: [], paths: [] };
        const paths = Array.from(new Set(endpoints.map(e => e.path))).sort();
        
        const models = new Set<string>();
        const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'any', 'object', 'integer', 'bool', 'int', 'float', 'dict', 'list']);
        
        endpoints.forEach(ep => {
            ep.responseBody?.forEach(prop => {
                const t = prop.type.replace('[]', '').trim();
                 if (!PRIMITIVE_TYPES.has(t.toLowerCase())) models.add(t);
            });
            ep.requestBody?.forEach(prop => {
                const t = prop.type.replace('[]', '').trim();
                 if (!PRIMITIVE_TYPES.has(t.toLowerCase())) models.add(t);
            });
        });
        return { models: Array.from(models).sort(), paths };
    }, [endpoints]);

    const { nodes, edges } = useMemo(() => {
        if (!endpoints.length) return { nodes: [], edges: [] };

        const initialNodes: Node[] = [];
        const initialEdges: Edge[] = [];
        const modelMap = new Set<string>();
        const addedEdges = new Set<string>();
        const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'any', 'object', 'integer', 'bool', 'int', 'float', 'dict', 'list']);

        const filteredEndpoints = endpoints.filter(ep => {
            if (!filterValue || filterValue === 'all') return true;
            
            if (filterValue.startsWith('model:')) {
                const targetModel = filterValue.substring(6);
                const hasResp = ep.responseBody?.some(r => r.type.replace('[]', '').trim() === targetModel);
                const hasReq = ep.requestBody?.some(r => r.type.replace('[]', '').trim() === targetModel);
                return hasResp || hasReq;
            } else if (filterValue.startsWith('path:')) {
                const targetPath = filterValue.substring(5);
                return ep.path === targetPath;
            }
            return true;
        });

        // Build Endpoint Nodes
        filteredEndpoints.forEach((ep) => {
            const epId = `ep-${ep.path}-${ep.methods[0]}`;
            initialNodes.push({
                id: epId,
                type: 'default',
                data: { label: (
                    <div className="flex flex-col items-start text-xs text-left p-1 w-full max-w-[280px]">
                        <span className="font-bold text-blue-600 dark:text-blue-400 mb-1">{ep.methods[0]}</span>
                        <span className="font-mono break-all whitespace-pre-wrap leading-tight text-slate-700 dark:text-slate-300">{ep.path}</span>
                    </div>
                )},
                position: { x: 0, y: 0 },
                style: { border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', padding: '4px', width: 'auto', minWidth: '150px' }
            });

            // Extract models from Response
            if (ep.responseBody) {
                ep.responseBody.forEach(prop => {
                    const typeName = prop.type.replace('[]', '').trim();
                    if (!PRIMITIVE_TYPES.has(typeName.toLowerCase())) {
                        const edgeId = `e-${epId}-${typeName}-res`;
                        if (!addedEdges.has(edgeId)) {
                            addedEdges.add(edgeId);
                            modelMap.add(typeName);
                            initialEdges.push({
                                id: edgeId,
                                source: epId,
                                target: `model-${typeName}`,
                                animated: true,
                                label: 'Returns',
                                style: { stroke: '#3b82f6' },
                                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
                            });
                        }
                    }
                });
            }

            // Extract models from Request
            if (ep.requestBody) {
                ep.requestBody.forEach(prop => {
                    const typeName = prop.type.replace('[]', '').trim();
                    if (!PRIMITIVE_TYPES.has(typeName.toLowerCase())) {
                        const edgeId = `e-${typeName}-${epId}-req`;
                        if (!addedEdges.has(edgeId)) {
                            addedEdges.add(edgeId);
                            modelMap.add(typeName);
                            initialEdges.push({
                                id: edgeId,
                                source: `model-${typeName}`,
                                target: epId,
                                animated: false,
                                label: 'Requires',
                                style: { stroke: '#f59e0b' },
                                markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
                            });
                        }
                    }
                });
            }
        });

        // Build Model Nodes
        Array.from(modelMap).forEach(modelName => {
            initialNodes.push({
                id: `model-${modelName}`,
                type: 'default',
                data: { label: (
                    <div className="flex flex-col items-center justify-center p-2 text-primary font-bold">
                        <Database className="w-5 h-5 mb-1 text-primary" />
                        <span>{modelName}</span>
                    </div>
                )},
                position: { x: 0, y: 0 },
                style: { border: '2px solid hsl(var(--primary))', borderRadius: '12px', background: 'hsl(var(--primary)/0.1)', minWidth: 150 }
            });
        });

        return getLayoutedElements(initialNodes, initialEdges, 'LR');
    }, [endpoints, filterValue]);

    return (
        <div className="w-full h-full relative bg-background flex flex-col">
            <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-primary/5 rounded-xl border border-primary/10 shadow-sm">
                                <Database className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-xl tracking-tight">Entity Map</h2>
                                {!loading && endpoints.length > 0 && (
                                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                        Data Models & API References
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            {headerRight && (
                                <div className="pl-3 border-l border-border/60">
                                    {headerRight}
                                </div>
                            )}
                        </div>
                    </div>
                
                    {/* Filter Row */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-80">
                             <Select value={filterValue} onValueChange={setFilterValue}>
                                <SelectTrigger className="w-full bg-muted/40 border-border/60 h-10">
                                    <SelectValue placeholder="Filter by endpoint or model..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <SelectItem value="all">All Available</SelectItem>
                                    
                                    {filterOptions.models.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>Data Models</SelectLabel>
                                            {filterOptions.models.map(m => (
                                                <SelectItem key={`model:${m}`} value={`model:${m}`}>{m}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                    
                                    {filterOptions.paths.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>API Routes</SelectLabel>
                                            {filterOptions.paths.map(p => (
                                                <SelectItem key={`path:${p}`} value={`path:${p}`}>{p}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {filterValue !== 'all' && (
                             <button 
                                 onClick={() => setFilterValue('all')}
                                 className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all ml-1"
                             >
                                 Clear Filter
                             </button>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex-1">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <ReactFlow 
                        nodes={nodes} 
                        edges={edges} 
                        fitView 
                        attributionPosition="bottom-left"
                        minZoom={0.1}
                    >
                        <Background color="#cbd5e1" gap={16} />
                        <Controls className="bg-background border-border" />
                    </ReactFlow>
                )}
            </div>
        </div>
    );
}
