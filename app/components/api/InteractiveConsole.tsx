import React, { useState } from 'react';
import { Play, Loader2, Braces, AlignLeft, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LocalApiEndpoint, SchemaField } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiSettings } from './ApiSettingsContext';

interface InteractiveConsoleProps {
    endpoint: LocalApiEndpoint;
}

interface RequestState {
    status: 'idle' | 'loading' | 'success' | 'error';
    statusCode?: number;
    data?: any;
    timeMs?: number;
    error?: string;
}

export function InteractiveConsole({ endpoint }: InteractiveConsoleProps) {
    const { baseUrl, authToken } = useApiSettings();
    
    // Parse path params
    const pathParamNames = endpoint.path.match(/{([^}]+)}/g)?.map(p => p.slice(1, -1)) || [];
    
    // Helper to generate default values based on type
    const generateDefaultValue = (field: SchemaField): any => {
        const type = field.type.toLowerCase();
        
        if (type.includes('list') || type.includes('array') || type.includes('[]')) {
            return [];
        }
        if (type === 'boolean' || type === 'bool') {
            return false;
        }
        if (type === 'integer' || type === 'number' || type === 'int' || type === 'float') {
            return 0;
        }
        if (type === 'object' || field.children) {
            if (field.children) {
                return field.children.reduce((acc, child) => ({
                    ...acc,
                    [child.name]: generateDefaultValue(child)
                }), {});
            }
            return {};
        }
        return "string";
    };

    // State for inputs
    const [pathParams, setPathParams] = useState<Record<string, string>>({});
    const [queryParams, setQueryParams] = useState<Record<string, string>>({});
    const [body, setBody] = useState<string>(
        endpoint.requestBody ? JSON.stringify(
            endpoint.requestBody.reduce((acc, f) => ({ ...acc, [f.name]: generateDefaultValue(f) }), {}), 
            null, 2
        ) : ''
    );
    
    const [request, setRequest] = useState<RequestState>({ status: 'idle' });

    const executeRequest = async () => {
        setRequest({ status: 'loading' });
        const startTime = performance.now();
        
        try {
            // Construct URL
            let url = endpoint.path;
            pathParamNames.forEach(name => {
                url = url.replace(`{${name}}`, pathParams[name] || `{${name}}`);
            });
            
            // Add Query Params
            const searchParams = new URLSearchParams();
            Object.entries(queryParams).forEach(([key, value]) => {
                if (value) searchParams.append(key, value);
            });
            const queryString = searchParams.toString();
            
            // Use configured baseUrl (remove trailing slash if both present)
            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            const cleanPath = url.startsWith('/') ? url : `/${url}`;
            const finalUrl = `${cleanBaseUrl}${cleanPath}${queryString ? `?${queryString}` : ''}`;

            // Prepare Headers
            const headers: Record<string, string> = { 
                'Content-Type': 'application/json' 
            };
            
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            // Execute
            const res = await fetch(finalUrl, {
                method: endpoint.methods[0] || 'GET',
                headers,
                body: ['POST', 'PUT', 'PATCH'].includes(endpoint.methods[0]) ? body : undefined,
            });
            
            // ...

            const data = await res.json().catch(() => ({}));
            const endTime = performance.now();

            setRequest({
                status: res.ok ? 'success' : 'error',
                statusCode: res.status,
                data,
                timeMs: Math.round(endTime - startTime),
            });
        } catch (err) {
            setRequest({
                status: 'error',
                error: String(err),
            });
        }
    };

    return (
        <div className="border-t border-border/50 bg-muted/5 p-4 rounded-b-lg">
            <div className="flex flex-col md:flex-row gap-6">
                
                {/* Inputs Column */}
                <div className="flex-1 space-y-5">
                    <div className="flex items-center justify-between">
                         <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <AlignLeft className="w-3.5 h-3.5" />
                            Request Parameters
                        </h3>
                    </div>

                    {/* Path Params */}
                    {pathParamNames.length > 0 && (
                        <div className="space-y-3">
                            <span className="text-xs font-medium text-foreground/80">Path Variables</span>
                            <div className="space-y-2">
                                {pathParamNames.map(name => (
                                    <div key={name} className="flex items-center gap-3">
                                        <span className="text-xs font-mono text-muted-foreground w-20 shrink-0 text-right">{name}</span>
                                        <Input 
                                            placeholder={`value for ${name}`}
                                            className="h-8 text-xs font-mono"
                                            value={pathParams[name] || ''}
                                            onChange={e => setPathParams(prev => ({ ...prev, [name]: e.target.value }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Query Params */}
                    {endpoint.queryParams.length > 0 && (
                        <div className="space-y-3">
                             <span className="text-xs font-medium text-foreground/80">Query Parameters</span>
                             <div className="space-y-2">
                                {endpoint.queryParams.map(param => (
                                    <div key={param.name} className="flex items-center gap-3">
                                        <div className="flex flex-col items-end w-24 shrink-0">
                                            <span className="text-xs font-mono text-muted-foreground">{param.name}</span>
                                            {param.required && <span className="text-[10px] text-red-400">required</span>}
                                        </div>
                                        <Input 
                                            placeholder={param.type}
                                            className="h-8 text-xs font-mono"
                                            value={queryParams[param.name] || ''}
                                            onChange={e => setQueryParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Body */}
                    {['POST', 'PUT', 'PATCH'].includes(endpoint.methods[0]) && (
                         <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground/80">Request Body (JSON)</span>
                            </div>
                            <textarea
                                className="w-full h-[200px] p-3 text-xs font-mono bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary/20"
                                value={body}
                                onChange={e => setBody(e.target.value)}
                            />
                        </div>
                    )}

                    <Button 
                        onClick={executeRequest} 
                        disabled={request.status === 'loading'}
                        className="w-full md:w-auto"
                        size="sm"
                    >
                        {request.status === 'loading' ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Sending...</>
                        ) : (
                            <><Play className="w-3.5 h-3.5 mr-2" /> Send Request</>
                        )}
                    </Button>
                </div>

                {/* Response Column - Only show if we have a request state */}
                <div className="flex-1 md:border-l border-border/50 md:pl-6 min-w-0">
                     <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Braces className="w-3.5 h-3.5" />
                            Response
                        </h3>
                        {request.status !== 'idle' && (
                             <div className="flex items-center gap-3">
                                {request.timeMs && (
                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                        <Clock className="w-3 h-3" /> {request.timeMs}ms
                                    </span>
                                )}
                                {request.statusCode && (
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold border",
                                        request.statusCode >= 200 && request.statusCode < 300 
                                            ? "bg-green-500/10 text-green-600 border-green-500/20"
                                            : "bg-red-500/10 text-red-600 border-red-500/20"
                                    )}>
                                        {request.statusCode}
                                    </span>
                                )}
                             </div>
                        )}
                    </div>

                    <div className="relative min-h-[300px] bg-background border border-border rounded-lg overflow-hidden">
                        {request.status === 'idle' && (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-sm">
                                Ready to execute
                            </div>
                        )}
                        
                        {request.status === 'loading' && (
                             <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                                <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
                            </div>
                        )}

                        {request.data && (
                            <pre className="p-4 text-xs font-mono overflow-auto h-[300px] text-foreground/80">
                                {JSON.stringify(request.data, null, 2)}
                            </pre>
                        )}
                        
                        {request.error && (
                             <div className="p-4 flex items-start gap-3 text-xs text-red-500 bg-red-50/10 h-full">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span className="font-mono">{request.error}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
