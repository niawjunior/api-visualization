'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Copy, Check, FileCode, ExternalLink, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiMethodBadge } from './ApiMethodBadge';

interface SchemaField {
    name: string;
    type: string;
    required: boolean;
    children?: SchemaField[];
}

interface ApiEndpointCardProps {
    endpoint: {
        path: string;
        methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS')[];
        params: { name: string; type: string; required: boolean; description?: string }[];
        queryParams: { name: string; type: string; required: boolean }[];
        requestBody?: SchemaField[];
        responseBody?: SchemaField[];
        responses?: Array<{
            statusCode?: number;
            isError: boolean;
            schema: SchemaField[];
        }>;
        filePath: string;
        relativePath: string;
        lineNumber: number;
        description?: string;
    };
    isExpanded?: boolean;
    onToggle?: () => void;
    onOpenFile?: (path: string) => void;
    onViewDependencies?: () => void;
}

function SchemaTree({ fields, level = 0 }: { fields: SchemaField[]; level?: number }) {
    return (
        <div className={cn('font-mono text-xs', level > 0 && 'ml-4 border-l border-border/50 pl-3')}>
            {fields.map((field, i) => (
                <div key={i} className="py-0.5">
                    <span className="text-blue-500 dark:text-blue-400">{field.name}</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-amber-600 dark:text-amber-400">{field.type}</span>
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                    {field.children && <SchemaTree fields={field.children} level={level + 1} />}
                </div>
            ))}
        </div>
    );
}

export function ApiEndpointCard({ endpoint, isExpanded, onToggle, onOpenFile, onViewDependencies }: ApiEndpointCardProps) {
    const [copied, setCopied] = useState(false);
    
    const generateCurl = () => {
        const method = endpoint.methods[0] || 'GET';
        const baseUrl = 'http://localhost:3000';
        let curl = `curl -X ${method} "${baseUrl}${endpoint.path}"`;
        
        if (['POST', 'PUT', 'PATCH'].includes(method) && endpoint.requestBody) {
            const bodyFields = endpoint.requestBody.reduce((acc, f) => {
                acc[f.name] = f.type === 'string' ? 'value' : f.type;
                return acc;
            }, {} as Record<string, string>);
            curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(bodyFields)}'`;
        }
        
        return curl;
    };
    
    const handleCopy = async () => {
        await navigator.clipboard.writeText(generateCurl());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <motion.div
            layout
            className={cn(
                'bg-card border border-border rounded-lg overflow-hidden transition-colors',
                isExpanded && 'ring-1 ring-primary/20'
            )}
        >
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
            >
                <div className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                    {endpoint.methods.map(method => (
                        <ApiMethodBadge key={method} method={method} size="sm" />
                    ))}
                </div>
                
                <span className="font-mono text-sm text-foreground flex-1 truncate">
                    {endpoint.path}
                </span>
                
                {endpoint.description && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {endpoint.description}
                    </span>
                )}
            </button>
            
            {/* Expanded Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border"
                    >
                        <div className="p-4 space-y-4">
                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
                                >
                                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied!' : 'Copy cURL'}
                                </button>
                                
                                <button
                                    onClick={() => onOpenFile?.(endpoint.filePath)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
                                >
                                    <FileCode className="w-3 h-3" />
                                    {endpoint.relativePath}
                                </button>
                                
                                {onViewDependencies && (
                                    <button
                                        onClick={onViewDependencies}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 rounded-md transition-colors"
                                    >
                                        <GitBranch className="w-3 h-3" />
                                        View Dependencies
                                    </button>
                                )}
                            </div>
                            
                            {/* Parameters */}
                            {endpoint.params.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                        Route Parameters
                                    </h4>
                                    <div className="bg-muted/30 rounded-md p-3">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-muted-foreground">
                                                    <th className="text-left font-medium pb-2">Name</th>
                                                    <th className="text-left font-medium pb-2">Type</th>
                                                    <th className="text-left font-medium pb-2">Required</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {endpoint.params.map((param, i) => (
                                                    <tr key={i}>
                                                        <td className="py-1 font-mono text-blue-500">{param.name}</td>
                                                        <td className="py-1 text-amber-600">{param.type}</td>
                                                        <td className="py-1">{param.required ? '✓' : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            
                            {/* Request Body */}
                            {endpoint.requestBody && endpoint.requestBody.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                        Request Body
                                    </h4>
                                    <div className="bg-muted/30 rounded-md p-3">
                                        <SchemaTree fields={endpoint.requestBody} />
                                    </div>
                                </div>
                            )}
                            
                            {/* Responses - Show all with status codes */}
                            {endpoint.responses && endpoint.responses.length > 0 ? (
                                <div className="space-y-3">
                                    {endpoint.responses.map((response, idx) => (
                                        <div key={idx}>
                                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                                    response.isError 
                                                        ? "bg-red-500/20 text-red-500" 
                                                        : "bg-green-500/20 text-green-500"
                                                )}>
                                                    {response.statusCode || (response.isError ? '4xx/5xx' : '2xx')}
                                                </span>
                                                {response.isError ? 'Error Response' : 'Success Response'}
                                            </h4>
                                            <div className="bg-muted/30 rounded-md p-3">
                                                <SchemaTree fields={response.schema} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : endpoint.responseBody && endpoint.responseBody.length > 0 ? (
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                        Response Schema
                                    </h4>
                                    <div className="bg-muted/30 rounded-md p-3">
                                        <SchemaTree fields={endpoint.responseBody} />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
