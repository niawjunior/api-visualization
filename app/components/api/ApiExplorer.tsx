'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Loader2, AlertCircle, RefreshCw, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ApiEndpointCard } from './ApiEndpointCard';
import { ApiMethodBadge } from './ApiMethodBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ApiExplorerProps {
    currentPath: string;
    onOpenFile?: (path: string) => void;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

interface LocalApiEndpoint {
    path: string;
    methods: HttpMethod[];
    params: { name: string; type: string; required: boolean; description?: string }[];
    queryParams: { name: string; type: string; required: boolean }[];
    requestBody?: { name: string; type: string; required: boolean }[];
    responseBody?: { name: string; type: string; required: boolean }[];
    filePath: string;
    relativePath: string;
    lineNumber: number;
    description?: string;
}

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function ApiExplorer({ currentPath, onOpenFile }: ApiExplorerProps) {
    const [endpoints, setEndpoints] = useState<LocalApiEndpoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState<HttpMethod[]>([]);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    
    // Load endpoints
    const loadEndpoints = async () => {
        if (!currentPath || !window.electron) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const result = await window.electron.analyzeApiEndpoints(currentPath);
            if (result.success) {
                setEndpoints(result.endpoints);
            } else {
                setError(result.error || 'Failed to analyze endpoints');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        loadEndpoints();
    }, [currentPath]);
    
    // Filter endpoints
    const filteredEndpoints = useMemo(() => {
        return endpoints.filter(ep => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesPath = ep.path.toLowerCase().includes(query);
                const matchesDesc = ep.description?.toLowerCase().includes(query);
                if (!matchesPath && !matchesDesc) return false;
            }
            
            // Method filter
            if (methodFilter.length > 0) {
                const hasMethod = ep.methods.some((m: HttpMethod) => methodFilter.includes(m));
                if (!hasMethod) return false;
            }
            
            return true;
        });
    }, [endpoints, searchQuery, methodFilter]);
    
    // Group by base path
    const groupedEndpoints = useMemo(() => {
        const groups: Record<string, LocalApiEndpoint[]> = {};
        
        for (const ep of filteredEndpoints) {
            // Extract base path (first two segments)
            const segments = ep.path.split('/').filter(Boolean);
            const basePath = segments.length > 1 ? `/${segments[0]}/${segments[1]}` : `/${segments[0]}`;
            
            if (!groups[basePath]) groups[basePath] = [];
            groups[basePath].push(ep);
        }
        
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [filteredEndpoints]);
    
    const toggleMethodFilter = (method: HttpMethod) => {
        setMethodFilter(prev => 
            prev.includes(method) 
                ? prev.filter(m => m !== method)
                : [...prev, method]
        );
    };
    
    return (
        <div className="h-full flex flex-col bg-background">
            {/* Premium Header */}
            <div className="shrink-0 border-b border-border/50 mt-14">
                <div className="max-w-4xl mx-auto p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Network className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-lg">API Explorer</h2>
                                {!loading && endpoints.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {endpoints.length} endpoints found
                                    </p>
                                )}
                            </div>
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={loadEndpoints} 
                            disabled={loading}
                            className="h-8 gap-2"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                    
                    {/* Search & Filters Row */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search endpoints by path or description..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-10 bg-background/50"
                            />
                        </div>
                        
                        {/* Method Filters */}
                        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg">
                            {ALL_METHODS.map(method => (
                                <button
                                    key={method}
                                    onClick={() => toggleMethodFilter(method)}
                                    className={cn(
                                        'transition-all',
                                        methodFilter.length > 0 && !methodFilter.includes(method) && 'opacity-40 hover:opacity-70'
                                    )}
                                >
                                    <ApiMethodBadge method={method} size="sm" />
                                </button>
                            ))}
                            {methodFilter.length > 0 && (
                                <button 
                                    onClick={() => setMethodFilter([])}
                                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-background rounded transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto p-6">
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Analyzing API endpoints...</p>
                    </div>
                ) : error ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <AlertCircle className="w-8 h-8 text-destructive" />
                        <p className="text-sm">{error}</p>
                        <Button variant="outline" size="sm" onClick={loadEndpoints}>
                            Retry
                        </Button>
                    </div>
                ) : filteredEndpoints.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <Network className="w-12 h-12 opacity-20" />
                        <p className="text-sm">
                            {endpoints.length === 0 
                                ? 'No API endpoints found in this project'
                                : 'No endpoints match your filters'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {groupedEndpoints.map(([basePath, eps]) => (
                            <div key={basePath}>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                                    {basePath}
                                </h3>
                                <div className="space-y-2">
                                    {eps.map((ep, i) => {
                                        const globalIndex = filteredEndpoints.indexOf(ep);
                                        return (
                                            <ApiEndpointCard
                                                key={ep.filePath + ep.path}
                                                endpoint={ep}
                                                isExpanded={expandedIndex === globalIndex}
                                                onToggle={() => setExpandedIndex(expandedIndex === globalIndex ? null : globalIndex)}
                                                onOpenFile={onOpenFile}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}
