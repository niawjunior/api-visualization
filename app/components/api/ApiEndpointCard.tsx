'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Copy, Check, FileCode, ExternalLink, GitBranch, Monitor, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiMethodBadge } from './ApiMethodBadge';

import { createPortal } from 'react-dom';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

// Editor Selector Component
interface EditorSelectorProps {
    path: string;
    line: number;
    relativePath: string;
    onOpen?: (path: string, line?: number, app?: 'antigravity' | 'vscode' | 'cursor' | 'system') => void;
}

function EditorSelector({ 
    path, 
    line, 
    relativePath, 
    onOpen 
}: EditorSelectorProps) {
    const [defaultApp, setDefaultApp] = useState<'antigravity' | 'vscode' | 'cursor' | 'system' | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('antigravity_editor_pref') as any || 'antigravity';
        }
        return 'antigravity';
    });

    const handleOpen = (app: 'antigravity' | 'vscode' | 'cursor' | 'system') => {
        onOpen?.(path, line, app);
        localStorage.setItem('antigravity_editor_pref', app);
        setDefaultApp(app);
    };

    return (
        <DropdownMenuPrimitive.Root>
            <DropdownMenuPrimitive.Trigger asChild>
                <button
                    className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-md transition-colors text-xs border border-border/50 outline-none focus:ring-1 focus:ring-primary/20"
                    title="Click to select editor"
                >
                     {/* Icon based on defaultApp */}
                    {defaultApp === 'vscode' ? <Code className="w-3.5 h-3.5 text-blue-500" /> :
                     defaultApp === 'cursor' ? <FileCode className="w-3.5 h-3.5 text-foreground" /> :
                     defaultApp === 'antigravity' ? <div className="w-3.5 h-3.5 bg-primary rounded-full" /> :
                     <Monitor className="w-3.5 h-3.5 text-muted-foreground" />}
                     
                    <span className="truncate max-w-[150px]">{relativePath}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </button>
            </DropdownMenuPrimitive.Trigger>

            <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content 
                    align="start"
                    sideOffset={4}
                    className="z-[9999] min-w-[200px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                >
                    <DropdownMenuPrimitive.Item 
                        onSelect={() => handleOpen('antigravity')}
                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <div className="w-3 h-3 bg-primary rounded-full mr-2" />
                        Antigravity
                        {defaultApp === 'antigravity' && <span className="ml-auto text-[10px] opacity-50">(Default)</span>}
                    </DropdownMenuPrimitive.Item>
                    
                    <DropdownMenuPrimitive.Item
                        onSelect={() => handleOpen('vscode')}
                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <Code className="w-3 h-3 text-blue-500 mr-2" />
                        VS Code
                        {defaultApp === 'vscode' && <span className="ml-auto text-[10px] opacity-50">(Default)</span>}
                    </DropdownMenuPrimitive.Item>
                    
                    <DropdownMenuPrimitive.Item
                        onSelect={() => handleOpen('cursor')}
                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <FileCode className="w-3 h-3 text-foreground mr-2" />
                        Cursor
                        {defaultApp === 'cursor' && <span className="ml-auto text-[10px] opacity-50">(Default)</span>}
                    </DropdownMenuPrimitive.Item>
                    
                    <DropdownMenuPrimitive.Item
                        onSelect={() => handleOpen('system')}
                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                        <Monitor className="w-3 h-3 text-muted-foreground mr-2" />
                        System Default
                        {defaultApp === 'system' && <span className="ml-auto text-[10px] opacity-50">(Default)</span>}
                    </DropdownMenuPrimitive.Item>
                </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
    );
}

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
    onOpenFile?: (path: string, line?: number, app?: 'antigravity' | 'vscode' | 'cursor' | 'system') => void;
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
                                
                                    <EditorSelector 
                                        path={endpoint.filePath} 
                                        line={endpoint.lineNumber} 
                                        relativePath={endpoint.relativePath}
                                        onOpen={onOpenFile} 
                                    />
                                
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
