'use client';

import { cn } from '@/lib/utils';

interface ApiMethodBadgeProps {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
    size?: 'sm' | 'md';
    className?: string;
}

const methodColors: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
    POST: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' },
    PUT: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
    DELETE: { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400' },
    PATCH: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
    HEAD: { bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400' },
    OPTIONS: { bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400' },
};

export function ApiMethodBadge({ method, size = 'md', className }: ApiMethodBadgeProps) {
    const colors = methodColors[method] || methodColors.GET;
    
    return (
        <span 
            className={cn(
                'font-mono font-bold rounded shrink-0',
                colors.bg,
                colors.text,
                size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
                className
            )}
        >
            {method}
        </span>
    );
}
