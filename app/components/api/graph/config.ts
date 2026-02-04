import { Database, Globe, Wrench, Layers } from 'lucide-react';

export const CATEGORY_CONFIG = {
  service: {
    color: '#3b82f6', // blue
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: Layers,
    label: 'Services',
  },
  database: {
    color: '#10b981', // green
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    icon: Database,
    label: 'Database',
  },
  external: {
    color: '#f59e0b', // amber
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: Globe,
    label: 'External APIs',
  },
  utility: {
    color: '#8b5cf6', // purple
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: Wrench,
    label: 'Utilities',
  },
};
