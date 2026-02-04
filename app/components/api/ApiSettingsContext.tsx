
import React, { createContext, useContext, useState, useEffect } from 'react';

interface ApiSettings {
    baseUrl: string;
    authToken: string;
}

interface ApiSettingsContextType extends ApiSettings {
    updateSettings: (settings: Partial<ApiSettings>) => void;
}

const ApiSettingsContext = createContext<ApiSettingsContextType | undefined>(undefined);

export function useApiSettings() {
    const context = useContext(ApiSettingsContext);
    if (!context) {
        throw new Error('useApiSettings must be used within an ApiSettingsProvider');
    }
    return context;
}

export function ApiSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<ApiSettings>({
        baseUrl: 'http://localhost:3000',
        authToken: '',
    });

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('antigravity_api_settings');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setSettings(prev => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error('Failed to parse api settings', e);
            }
        }
    }, []);

    const updateSettings = (newSettings: Partial<ApiSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...newSettings };
            localStorage.setItem('antigravity_api_settings', JSON.stringify(next));
            return next;
        });
    };

    return (
        <ApiSettingsContext.Provider value={{ ...settings, updateSettings }}>
            {children}
        </ApiSettingsContext.Provider>
    );
}
