'use client';

import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Monitor, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

type ViewMode = 'structure' | 'deps' | 'api';

interface SettingsState {
  defaultViewMode: ViewMode;
  defaultEditor: string;
}

const VIEW_MODES: { value: ViewMode; label: string; description: string }[] = [
  { value: 'structure', label: 'Structure', description: 'File hierarchy view' },
  { value: 'deps', label: 'Dependencies', description: 'Import relationships' },
  { value: 'api', label: 'API', description: 'Endpoint explorer' },
];

const EDITORS = [
  { value: 'system', label: 'System Default' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'antigravity', label: 'Antigravity' },
];

export function SettingsDialog() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  
  const [settings, setSettings] = useState<SettingsState>(() => {
    if (typeof window !== 'undefined') {
      return {
        defaultViewMode: (localStorage.getItem('duke-default-view') as ViewMode) || 'structure',
        defaultEditor: localStorage.getItem('duke-default-editor') || 'system',
      };
    }
    return { defaultViewMode: 'structure', defaultEditor: 'system' };
  });

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    localStorage.setItem(`duke-default-${key === 'defaultViewMode' ? 'view' : 'editor'}`, value);
  };

  const themes = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your Duke experience.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Theme */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Theme</Label>
            <div className="flex gap-2">
              {themes.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-all",
                    theme === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Default View Mode */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default View</Label>
            <p className="text-xs text-muted-foreground">
              The view mode shown when opening a project.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {VIEW_MODES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateSetting('defaultViewMode', value)}
                  className={cn(
                    "p-2 rounded-lg border text-xs font-medium transition-all",
                    settings.defaultViewMode === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Default Editor */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Editor</Label>
            <p className="text-xs text-muted-foreground">
              Used for "Open File" actions.
            </p>
            <div className="space-y-1 mt-2">
              {EDITORS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateSetting('defaultEditor', value)}
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-lg border text-sm transition-all",
                    settings.defaultEditor === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className={settings.defaultEditor === value ? "text-primary font-medium" : "text-muted-foreground"}>
                    {label}
                  </span>
                  {settings.defaultEditor === value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Settings are saved automatically.
        </div>
      </DialogContent>
    </Dialog>
  );
}
