"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemScanner = void 0;
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
class FileSystemScanner {
    /**
     * Efficiently scan directory using glob
     */
    static async scan(options) {
        const { path: dirPath, recursive = true, extensions, pattern, ignore } = options;
        // Construct glob pattern
        let globPattern = '**/*';
        if (extensions && extensions.length > 0) {
            // Single extension: *.pdf, Multiple: *.{pdf,doc,docx}
            const extPattern = extensions.length === 1
                ? extensions[0]
                : `{${extensions.join(',')}}`;
            globPattern = `**/*.${extPattern}`;
        }
        // If not recursive, restrict glob
        if (!recursive) {
            if (extensions && extensions.length > 0) {
                const extPattern = extensions.length === 1
                    ? extensions[0]
                    : `{${extensions.join(',')}}`;
                globPattern = `*.${extPattern}`;
            }
            else {
                globPattern = '*';
            }
        }
        try {
            // Use glob for efficient scanning
            const matches = await (0, glob_1.glob)(globPattern, {
                cwd: dirPath,
                dot: false,
                ignore: ignore || ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
                absolute: true // Return absolute paths
            });
            // Filter by regex pattern if needed
            if (pattern) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                return matches.filter(f => regex.test(path_1.default.basename(f)));
            }
            return matches;
        }
        catch (error) {
            console.error('Scan error:', error);
            return [];
        }
    }
}
exports.FileSystemScanner = FileSystemScanner;
