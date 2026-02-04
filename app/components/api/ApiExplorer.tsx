'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Filter, Loader2, AlertCircle, RefreshCw, Network, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ApiEndpointCard } from './ApiEndpointCard';
import { ApiMethodBadge } from './ApiMethodBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ApiDependencyGraph from './ApiDependencyGraph';

import { DependencyFilter, DependencyOption } from './DependencyFilter';
import { LocalApiEndpoint, DependencyInfo, HttpMethod } from './types';
import { ApiSettingsProvider } from './ApiSettingsContext';
import { ApiSettingsDialog } from './ApiSettingsDialog';

interface ApiExplorerProps {
    currentPath: string;
    onOpenFile?: (path: string, line?: number, app?: string) => void;
    headerRight?: React.ReactNode;
}

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function ApiExplorer({ currentPath, onOpenFile, headerRight }: ApiExplorerProps) {
    const [endpoints, setEndpoints] = useState<LocalApiEndpoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState<HttpMethod[]>([]);
    const [dependencyFilter, setDependencyFilter] = useState<string | null>(null);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [selectedEndpoint, setSelectedEndpoint] = useState<LocalApiEndpoint | null>(null);
    
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcut for search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
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

    // Extract Unique Dependencies
    const dependencyOptions = useMemo<DependencyOption[]>(() => {
        const optionMap = new Map<string, DependencyOption>();
        
        endpoints.forEach(ep => {
            if (!ep.dependencies?.grouped) return;
            
            ep.dependencies.grouped.forEach(dep => {
                const key = dep.module; // Unique key for dependency
                if (!optionMap.has(key)) {
                    optionMap.set(key, {
                        label: dep.moduleLabel || dep.module,
                        value: dep.module,
                        type: dep.type,
                        count: 0
                    });
                }
                const option = optionMap.get(key)!;
                option.count++;
            });
        });

        return Array.from(optionMap.values()).sort((a, b) => b.count - a.count);
    }, [endpoints]);
    
    // Filter endpoints
    const filteredEndpoints = useMemo(() => {
        return endpoints.filter(ep => {
            // Search filter (path, description, function name)
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesPath = ep.path.toLowerCase().includes(query);
                const matchesDesc = ep.description?.toLowerCase().includes(query);
                const matchesFunction = ep.functionName?.toLowerCase().includes(query);
                if (!matchesPath && !matchesDesc && !matchesFunction) return false;
            }
            
            // Method filter
            if (methodFilter.length > 0) {
                const hasMethod = ep.methods.some((m: HttpMethod) => methodFilter.includes(m));
                if (!hasMethod) return false;
            }

            // Dependency filter
            if (dependencyFilter) {
                const hasDependency = ep.dependencies?.grouped?.some(
                    dep => dep.module === dependencyFilter
                );
                if (!hasDependency) return false;
            }
            
            return true;
        });
    }, [endpoints, searchQuery, methodFilter, dependencyFilter]);
    
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
        <ApiSettingsProvider>
            <div className="h-full flex flex-col bg-background">
            {/* Premium Header */}
            <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-primary/5 rounded-xl border border-primary/10 shadow-sm">
                                <Network className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-xl tracking-tight">API Explorer</h2>
                                {!loading && endpoints.length > 0 && (
                                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                        {endpoints.length} endpoints detected
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={loadEndpoints} 
                                disabled={loading}
                                className="h-9 gap-2 shadow-sm border-border/60 hover:bg-muted/50"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                                Refresh
                            </Button>
                            
                            <ApiSettingsDialog />

                            {headerRight && (
                                <div className="pl-3 border-l border-border/60">
                                    {headerRight}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Search & Filters Row */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                            <Input
                                ref={searchInputRef}
                                placeholder="Search endpoints... (Cmd+P)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-10 bg-muted/40 border-border/60 focus-visible:bg-background transition-all"
                            />
                        </div>
                        
                        <DependencyFilter 
                            options={dependencyOptions}
                            selected={dependencyFilter}
                            onSelect={setDependencyFilter}
                        />

                        {/* Method Filters */}
                        <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border/40 rounded-lg">
                            {ALL_METHODS.map(method => (
                                <button
                                    key={method}
                                    onClick={() => toggleMethodFilter(method)}
                                    className={cn(
                                        'transition-all duration-200 rounded-md',
                                        methodFilter.length > 0 && !methodFilter.includes(method) 
                                            ? 'opacity-40 grayscale hover:opacity-70 hover:grayscale-0' 
                                            : 'opacity-100 shadow-sm'
                                    )}
                                >
                                    <ApiMethodBadge method={method} size="sm" />
                                </button>
                            ))}
                            {methodFilter.length > 0 && (
                                <button 
                                    onClick={() => setMethodFilter([])}
                                    className="px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-all ml-1"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 overflow-auto scroll-smooth">
                <div className="p-6 pb-20">
                {loading ? (
                    <div className="space-y-6">
                        {/* Skeleton loading state */}
                        {[1, 2].map((group) => (
                            <div key={group} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded bg-muted/60 animate-pulse" />
                                    <div className="h-5 w-32 rounded bg-muted/60 animate-pulse" />
                                    <div className="h-4 w-8 rounded-full bg-muted/60 animate-pulse" />
                                </div>
                                <div className="space-y-2 pl-7">
                                    {Array.from({ length: group === 1 ? 4 : 2 }).map((_, i) => (
                                        <div key={i} className="p-4 rounded-lg border border-border/50 bg-card space-y-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-6 w-16 rounded-full bg-muted/60 animate-pulse" />
                                                <div className="h-5 w-48 rounded bg-muted/60 animate-pulse" />
                                                <div className="h-4 w-20 ml-auto rounded bg-muted/60 animate-pulse" />
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="h-5 w-14 rounded-full bg-muted/60 animate-pulse" />
                                                <div className="h-5 w-14 rounded-full bg-muted/60 animate-pulse" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="text-center text-sm text-muted-foreground animate-pulse pt-4">
                            Scanning for API endpoints...
                        </p>
                    </div>
                ) : error ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 py-20">
                        <div className="p-4 rounded-full bg-red-500/10 text-red-500">
                             <AlertCircle className="w-8 h-8" />
                        </div>
                        <div className="text-center space-y-2">
                             <p className="text-sm font-medium text-foreground">Analysis Failed</p>
                             <p className="text-xs max-w-[300px]">{error}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={loadEndpoints}>
                            Try Again
                        </Button>
                    </div>
                ) : filteredEndpoints.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 py-20">
                        <div className="p-6 rounded-full bg-muted/20">
                            <Network className="w-12 h-12 opacity-20" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-foreground">No endpoints found</p>
                            <p className="text-xs mt-1">
                                {endpoints.length === 0 
                                    ? 'Try analyzing a different project directory'
                                    : 'Adjust your filters to see results'
                                }
                            </p>
                            {dependencyFilter && (
                                <span className="block mt-1">
                                    Filtered by dependency: <span className="font-semibold text-primary">{dependencyOptions.find(o => o.value === dependencyFilter)?.label}</span>
                                </span>
                            )}
                        </div>
                        {endpoints.length > 0 && (
                             <Button variant="ghost" size="sm" onClick={() => {
                                 setSearchQuery('');
                                 setMethodFilter([]);
                                 setDependencyFilter(null);
                             }}>
                                Clear Filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-10">
                        {groupedEndpoints.map(([basePath, eps]) => (
                            <div key={basePath} className="relative">
                                <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur-sm border-b border-border/40 mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider font-mono">
                                        {basePath}
                                    </h3>
                                    <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                        {eps.length}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {eps.map((ep, i) => {
                                        const globalIndex = filteredEndpoints.indexOf(ep);
                                        return (
                                            <ApiEndpointCard
                                                key={ep.filePath + ep.path + '-' + ep.methods.join('-')}
                                                endpoint={ep}
                                                isExpanded={expandedIndex === globalIndex}
                                                onToggle={() => setExpandedIndex(expandedIndex === globalIndex ? null : globalIndex)}
                                                onOpenFile={onOpenFile}
                                                onViewDependencies={() => setSelectedEndpoint(ep)}
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
            
            {/* Dependency Graph Overlay */}
            <AnimatePresence>
                {selectedEndpoint && (
                    <ApiDependencyGraph
                        endpoint={selectedEndpoint}
                        allEndpoints={endpoints}
                        onClose={() => setSelectedEndpoint(null)}
                        onOpenFile={onOpenFile}
                    />
                )}
            </AnimatePresence>
        </div>
        </ApiSettingsProvider>
    );
}
