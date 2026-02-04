import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, Database, Server, Globe, Wrench, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DependencyInfo } from './types';

export interface DependencyOption {
    label: string;
    value: string;
    type: DependencyInfo['type'];
    count: number;
}

interface DependencyFilterProps {
    options: DependencyOption[];
    selected: string | null;
    onSelect: (value: string | null) => void;
}

const TYPE_ICONS = {
    service: Server,
    database: Database,
    external: Globe,
    utility: Wrench,
};

const TYPE_COLORS = {
    service: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    database: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    external: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    utility: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
};

export function DependencyFilter({ options, selected, onSelect }: DependencyFilterProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === selected);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-9 px-3 flex items-center gap-2 rounded-lg border text-xs font-medium transition-all duration-200",
                    isOpen ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "border-border/60 hover:bg-muted/50",
                    selected ? "bg-primary/10 border-primary/30 text-primary" : "text-muted-foreground"
                )}
            >
                <Filter className="w-3.5 h-3.5" />
                <span>
                    {selectedOption ? (
                        <span className="flex items-center gap-1.5">
                            {selectedOption.label}
                            <span className="opacity-50">({selectedOption.count})</span>
                        </span>
                    ) : (
                        "Filter by Dependency"
                    )}
                </span>
                {selected && (
                    <div 
                        role="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(null);
                        }}
                        className="ml-1 p-0.5 hover:bg-background/80 rounded-full"
                    >
                        <X className="w-3 h-3" />
                    </div>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-64 p-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg z-50 flex flex-col gap-1 max-h-[320px] overflow-y-auto"
                    >
                        {options.length === 0 ? (
                            <div className="p-3 text-center text-xs text-muted-foreground">
                                No dependencies found
                            </div>
                        ) : (
                            options.map((option) => {
                                const Icon = TYPE_ICONS[option.type] || Wrench;
                                const isSelected = selected === option.value;
                                
                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            onSelect(isSelected ? null : option.value);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors",
                                            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"
                                        )}
                                    >
                                        <div className="flex items-center gap-2.5 overflow-hidden">
                                            <div className={cn("p-1.5 rounded-md border shrink-0", TYPE_COLORS[option.type])}>
                                                <Icon className="w-3 h-3" />
                                            </div>
                                            <div className="flex flex-col items-start truncate">
                                                <span className="font-medium truncate max-w-[140px]">{option.label}</span>
                                                <span className="text-[10px] text-muted-foreground capitalize opacity-70">{option.type}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground font-mono">
                                                {option.count}
                                            </span>
                                            {isSelected && <Check className="w-3.5 h-3.5 opacity-60" />}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
