
import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useApiSettings } from './ApiSettingsContext';

export function ApiSettingsDialog() {
    const { baseUrl, authToken, updateSettings } = useApiSettings();
    const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
    const [localToken, setLocalToken] = useState(authToken);
    const [open, setOpen] = useState(false);

    // Sync when opening
    useEffect(() => {
        if (open) {
            setLocalBaseUrl(baseUrl);
            setLocalToken(authToken);
        }
    }, [open, baseUrl, authToken]);

    const handleSave = () => {
        updateSettings({
            baseUrl: localBaseUrl,
            authToken: localToken
        });
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                    <Settings className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>API Environment Settings</DialogTitle>
                    <DialogDescription>
                        Configure the base URL and authentication for the "Try it out" console.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="baseUrl">Base URL</Label>
                        <Input
                            id="baseUrl"
                            value={localBaseUrl}
                            onChange={(e) => setLocalBaseUrl(e.target.value)}
                            placeholder="http://localhost:3000"
                            className="font-mono text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            The root URL for all API requests.
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="token">
                            Bearer Token <span className="text-muted-foreground font-normal">(Optional)</span>
                        </Label>
                        <Input
                            id="token"
                            value={localToken}
                            onChange={(e) => setLocalToken(e.target.value)}
                            placeholder="eyJhbGciOiJIUz..."
                            className="font-mono text-xs"
                            type="password"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Will be added as <code>Authorization: Bearer &lt;token&gt;</code> header.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Settings
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
