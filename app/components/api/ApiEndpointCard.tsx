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
    onOpen?: (path: string, line?: number, app?: string) => void;
}

const DEFAULT_EDITORS = [
    { name: 'VS Code', key: 'vscode', icon: Code, color: 'text-blue-500' },
    { name: 'Cursor', key: 'cursor', icon: FileCode, color: 'text-foreground' },
];

interface DetectedEditor {
    name: string;
    path: string;
    key: string;
}

function EditorSelector({ 
    path, 
    line, 
    relativePath, 
    onOpen 
}: EditorSelectorProps) {
    const [editors, setEditors] = useState<DetectedEditor[]>([]);
    const [defaultApp, setDefaultApp] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('antigravity_editor_pref') || 'system';
        }
        return 'system';
    });

    useEffect(() => {
        if (window.electron && window.electron.getAvailableEditors) {
            window.electron.getAvailableEditors().then((available) => {
                if (available && available.length > 0) {
                     setEditors(available);
                     // If no pref, default to first available
                     if (!localStorage.getItem('antigravity_editor_pref')) {
                         setDefaultApp(available[0].key);
                     }
                } else {
                     // Fallback to defaults if detection fails or empty
                     // We don't have detection in dev usually, so show VS Code/Cursor purely as suggestions?
                     // actually, let's just stick to what we know + system
                     setEditors([]);
                }
            });
        } else {
             setEditors([]);
        }
    }, []);

    const handleOpen = (app: string) => {
        const appKey = app;
        
        onOpen?.(path, line, appKey);
        localStorage.setItem('antigravity_editor_pref', appKey);
        setDefaultApp(appKey);
    };

    // Helper to get icon
    const getIcon = (key: string) => {
        if (key === 'vscode') return <Code className="w-3.5 h-3.5 text-blue-500" />;
        if (key === 'cursor') return <FileCode className="w-3.5 h-3.5 text-foreground" />;
        if (key === 'antigravity') return <div className="w-3.5 h-3.5 bg-primary rounded-full" />;
        if (key === 'system') return <Monitor className="w-3.5 h-3.5 text-muted-foreground" />;
        return <FileCode className="w-3.5 h-3.5 text-muted-foreground" />;
    };

    return (
        <DropdownMenuPrimitive.Root>
            <DropdownMenuPrimitive.Trigger asChild>
                <button
                    className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-md transition-colors text-xs border border-border/50 outline-none focus:ring-1 focus:ring-primary/20"
                    title="Click to select editor"
                >
                     {getIcon(defaultApp || 'antigravity')}
                     
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
                    {/* Dynamic Editors */}
                    {editors.map((editor) => (
                         <DropdownMenuPrimitive.Item
                            key={editor.key}
                            onSelect={() => handleOpen(editor.key)}
                            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                            {getIcon(editor.key)}
                            <span className="ml-2">{editor.name}</span>
                            {defaultApp === editor.key && <span className="ml-auto text-[10px] opacity-50">(Default)</span>}
                        </DropdownMenuPrimitive.Item>
                    ))}
                    
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
        functionName?: string;
        description?: string;
    };
    isExpanded?: boolean;
    onToggle?: () => void;
    onOpenFile?: (path: string, line?: number, app?: string) => void;
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
                'group bg-card border border-border rounded-lg overflow-hidden transition-all duration-200',
                isExpanded ? 'ring-1 ring-primary/10 shadow-md' : 'hover:border-primary/20 hover:shadow-sm'
            )}
        >
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/30 transition-colors text-left"
            >
                <div className={cn("text-muted-foreground transition-transform duration-200", isExpanded && "rotate-90")}>
                    <ChevronRight className="w-4 h-4" />
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                    {endpoint.methods.map(method => (
                        <ApiMethodBadge key={method} method={method} size="sm" />
                    ))}
                </div>
                
                <span className="font-mono text-sm text-foreground/90 font-medium flex-1 truncate">
                    {endpoint.path}
                </span>
                
                {endpoint.description && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:inline-block">
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
                        className="border-t border-border/50"
                    >
                        <div className="p-5 space-y-6 bg-muted/5">
                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-border/50">
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-background border border-border/60 hover:border-primary/30 hover:bg-accent hover:text-accent-foreground rounded-md transition-all shadow-sm"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                                    {copied ? 'Copied' : 'Copy cURL'}
                                </button>
                                
                                {endpoint.functionName && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-muted/50 border border-border/60 rounded-md group/func">
                                        <Code className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="font-mono text-muted-foreground select-all group-hover/func:text-foreground transition-colors">
                                            {endpoint.functionName}
                                        </span>
                                    </div>
                                )}

                                <div className="ml-auto flex items-center gap-2">
                                     <EditorSelector 
                                        path={endpoint.filePath} 
                                        line={endpoint.lineNumber} 
                                        relativePath={endpoint.relativePath}
                                        onOpen={onOpenFile} 
                                    />
                                    
                                    {onViewDependencies && (
                                        <button
                                            onClick={onViewDependencies}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50/50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 rounded-md transition-colors"
                                        >
                                            <GitBranch className="w-3.5 h-3.5" />
                                            Dependencies
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* Parameters */}
                            {endpoint.params.length > 0 && (
                                <div>
                                    <h4 className="text-[11px] font-bold text-muted-foreground/70 mb-3 uppercase tracking-wider pl-1">
                                        Parameters
                                    </h4>
                                    <div className="bg-background border border-border/60 rounded-lg overflow-hidden shadow-sm overflow-x-auto">
                                        <table className="w-full text-xs min-w-[400px]">
                                            <thead className="bg-muted/30 border-b border-border/50">
                                                <tr>
                                                    <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[30%]">Name</th>
                                                    <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[30%]">Type</th>
                                                    <th className="text-left font-medium text-muted-foreground py-2 px-4">Required</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30">
                                                {endpoint.params.map((param, i) => (
                                                    <tr key={i} className="hover:bg-muted/10 transition-colors">
                                                        <td className="py-2.5 px-4 font-mono text-blue-600 dark:text-blue-400 font-medium">{param.name}</td>
                                                        <td className="py-2.5 px-4 font-mono text-amber-600 dark:text-amber-500">{param.type}</td>
                                                        <td className="py-2.5 px-4">
                                                            {param.required ? (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                                                                    Required
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground/50 text-[10px]">Optional</span>
                                                            )}
                                                        </td>
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
                                    <h4 className="text-[11px] font-bold text-muted-foreground/70 mb-3 uppercase tracking-wider pl-1">
                                        Request Body
                                    </h4>
                                    <div className="bg-background border border-border/60 rounded-lg p-4 shadow-sm overflow-x-auto">
                                        <SchemaTree fields={endpoint.requestBody} />
                                    </div>
                                </div>
                            )}
                            
                            {/* Responses */}
                            {(endpoint.responses && endpoint.responses.length > 0) || (endpoint.responseBody && endpoint.responseBody.length > 0) ? (
                                <div>
                                     <h4 className="text-[11px] font-bold text-muted-foreground/70 mb-3 uppercase tracking-wider pl-1">
                                        Responses
                                    </h4>
                                    <div className="space-y-4">
                                        {endpoint.responses?.map((response, idx) => (
                                            <div key={idx} className="bg-background border border-border/60 rounded-lg overflow-hidden shadow-sm">
                                                <div className={cn(
                                                    "px-4 py-2 border-b border-border/50 flex items-center gap-3 text-xs font-medium",
                                                    response.isError ? "bg-red-50/30 dark:bg-red-950/10" : "bg-green-50/30 dark:bg-green-950/10"
                                                )}>
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-bold border",
                                                        response.isError 
                                                            ? "bg-white dark:bg-red-950/50 text-red-600 border-red-200 dark:border-red-900/50" 
                                                            : "bg-white dark:bg-green-950/50 text-green-600 border-green-200 dark:border-green-900/50"
                                                    )}>
                                                        {response.statusCode || (response.isError ? 'Error' : '200 OK')}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        {response.isError ? 'Error Response' : 'Success Response'}
                                                    </span>
                                                </div>
                                                <div className="p-4 overflow-x-auto">
                                                    <SchemaTree fields={response.schema} />
                                                </div>
                                            </div>
                                        ))}
                                        {(!endpoint.responses || endpoint.responses.length === 0) && endpoint.responseBody && (
                                             <div className="bg-background border border-border/60 rounded-lg p-4 shadow-sm overflow-x-auto">
                                                <SchemaTree fields={endpoint.responseBody} />
                                            </div>
                                        )}
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
