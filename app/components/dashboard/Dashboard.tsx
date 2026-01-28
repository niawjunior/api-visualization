'use client';

import { useState, useEffect } from 'react';
import { StorageChart } from './StorageChart';
import { RecentFilesGrid } from './RecentFilesGrid';
import { FileEntry } from '../file-browser/FileExplorer';
import { RefreshCw, Download, ArrowRight, Sparkles, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFileNavigation } from '../file-browser/useFileNavigation';

interface DashboardProps {
  onNavigate: (path: string) => void;
  onOpen: (path: string) => void;
}

interface DashboardStats {
  types: Record<string, number>;
  totalSize: number;
  fileCount: number;
  folderCount: number;
}

export function Dashboard({ onNavigate, onOpen }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);
  const [homePath, setHomePath] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electron) {
        window.electron.getDesktopPath().then(setHomePath);
    }
  }, []);

  useEffect(() => {
    if (homePath) loadData();
  }, [homePath]);

  const loadData = async () => {
    if (!homePath || !window.electron) return;
    setLoading(true);
    try {
        // 1. Get Stats (Electron)
        const statsData = await window.electron.getDirectoryStats(homePath);
        setStats(statsData);

        // 2. Get Files (Electron)
        const result = await window.electron.listFiles({ path: homePath, sort: 'name' });
        if (result.success && result.files) {
             const sorted = (result.files as FileEntry[]).sort((a, b) => b.lastModified - a.lastModified);
             setRecentFiles(sorted.slice(0, 8));
        }

    } catch (error) {
        console.error("Dashboard load error:", error);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background/50 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Welcome back
              </h1>
              <p className="text-muted-foreground text-sm">Here's what's happening in your digital space.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-8 gap-2">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
          </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Main Column (2/3) */}
          <div className="md:col-span-8 flex flex-col gap-6">
              {/* Recent Files Section */}
              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                          <div className="p-1 bg-primary/10 rounded-md">
                             <Download className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="text-sm font-semibold">Recent Files</h3>
                      </div>
                      <Button variant="ghost" className="text-xs h-auto p-0 hover:bg-transparent hover:text-primary transition-colors" onClick={() => onNavigate(homePath)}>
                          View all <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                  </div>
                  <RecentFilesGrid files={recentFiles} onNavigate={onNavigate} onOpen={onOpen} />
              </div>
          </div>

          {/* Sidebar Column (1/3) */}
          <div className="md:col-span-4 flex flex-col gap-6">
             {/* Storage Card */}
             <StorageChart stats={stats} loading={loading} />
             
             {/* Quick Actions Card */}
             <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                     <Sparkles className="w-4 h-4 text-amber-500" />
                     <h3 className="text-sm font-semibold">Quick Actions</h3>
                 </div>
                 
                 <div className="grid grid-cols-1 gap-2">
                     <Button variant="outline" className="w-full justify-start h-10 text-xs font-medium border-border/50 hover:bg-secondary/50 hover:border-border" onClick={() => onNavigate(homePath)}>
                        <Monitor className="w-3.5 h-3.5 mr-2 text-purple-500" />
                        Explore Desktop
                     </Button>
                 </div>
             </div>
          </div>
      </div>
    </div>
  );
}
