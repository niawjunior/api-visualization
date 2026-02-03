/**
 * Security Guards
 * Utilities for validating paths and permissions.
 */
import path from 'path';
import os from 'os';

/**
 * Validate paths are within allowed directories (Home directory)
 */
export const isPathAllowed = (targetPath: string): boolean => {
    try {
        const home = os.homedir();
        const resolved = path.resolve(targetPath);
        // Allow paths within home directory only
        return resolved.startsWith(home);
    } catch (e) {
        return false;
    }
};
