'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatSize } from '../file-browser/FileEntryRow';
import { Loader2 } from 'lucide-react';

interface StorageChartProps {
  stats: {
    types: Record<string, number>;
    totalSize: number;
    fileCount: number;
    folderCount: number;
  } | null;
  loading: boolean;
}

const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#f59e0b', '#10b981', '#6b7280'];

export function StorageChart({ stats, loading }: StorageChartProps) {
  if (loading || !stats) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground bg-card border border-border rounded-xl">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span className="text-xs">Analyzing storage...</span>
      </div>
    );
  }

  const data = Object.entries(stats.types)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) // Top 5
    .map(([name, value]) => ({ name: name.toUpperCase(), value }));
    
  // Add "Other"
  const top5Count = data.reduce((acc, curr) => acc + curr.value, 0);
  if (stats.fileCount > top5Count) {
      data.push({ name: 'OTHER', value: stats.fileCount - top5Count });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-[300px] shadow-sm relative overflow-hidden">
      <div className="flex flex-col gap-1 mb-4 z-10">
          <h3 className="text-sm font-medium text-muted-foreground">Storage Overview</h3>
          <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">{formatSize(stats.totalSize)}</span>
              <span className="text-sm text-muted-foreground font-medium">{stats.fileCount} files</span>
          </div>
      </div>
      
      <div className="flex-1 min-h-0 relative -mx-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 10, bottom: 20 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
                label={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff' }}
                itemStyle={{ color: '#fff', fontSize: '12px' }}
                formatter={(value: any) => [`${value} files`, 'Count']}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Custom Legend at Bottom */}
          <div className="absolute bottom-4 inset-x-0 flex flex-wrap justify-center gap-3 text-[10px] px-4">
              {data.slice(0, 4).map((entry, index) => (
                   <div key={entry.name} className="flex items-center gap-1.5 bg-background/50 backdrop-blur-sm px-2 py-1 rounded-full border border-border/50 shadow-sm">
                       <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                       <span className="text-muted-foreground font-medium">{entry.name}</span>
                       <span className="text-foreground font-mono">{entry.value}</span>
                   </div>
               ))}
          </div>
      </div>
    </div>
  );
}
