"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filePathToRoutePath = filePathToRoutePath;
exports.extractRouteParams = extractRouteParams;
exports.findMethodLineNumber = findMethodLineNumber;
exports.extractJSDocDescription = extractJSDocDescription;
/**
 * Path Utilities
 * Helper functions for route path manipulation.
 */
const typescript_1 = __importDefault(require("typescript"));
const path_1 = __importDefault(require("path"));
// ============================================================================
// Route Path Conversion
// ============================================================================
/**
 * Convert a file path to an API route path.
 * Example: "app/api/users/route.ts" -> "/api/users"
 */
function filePathToRoutePath(filePath, rootPath) {
    let relativePath = path_1.default.relative(rootPath, filePath).replace(/\\/g, '/');
    // Handle App Router
    if (relativePath.includes('/route.')) {
        relativePath = relativePath.replace(/\/route\.(ts|tsx|js|jsx)$/, '');
    }
    // Handle app directory prefix
    if (relativePath.startsWith('app/')) {
        relativePath = relativePath.replace(/^app/, '');
    }
    // Handle Pages API
    if (relativePath.startsWith('pages/')) {
        relativePath = relativePath.replace(/^pages/, '');
        relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');
    }
    // Ensure leading slash
    if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath;
    }
    return relativePath;
}
// ============================================================================
// Route Parameter Extraction
// ============================================================================
/**
 * Extract route parameters from a path.
 * Example: "/api/users/[id]/posts/[...slug]" -> [{ name: "id", ... }, { name: "slug", ... }]
 */
function extractRouteParams(routePath) {
    const params = [];
    const paramRegex = /\[(?:\.\.\.)?(\w+)\]/g;
    let match;
    while ((match = paramRegex.exec(routePath)) !== null) {
        params.push({
            name: match[1],
            type: 'string',
            optional: false,
        });
    }
    return params;
}
// ============================================================================
// Source File Utilities
// ============================================================================
/**
 * Find the line number where a method is declared.
 */
function findMethodLineNumber(sourceFile, method) {
    let lineNumber = 1;
    typescript_1.default.forEachChild(sourceFile, (node) => {
        if (typescript_1.default.isFunctionDeclaration(node) && node.name?.text === method) {
            lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        }
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (typescript_1.default.isIdentifier(decl.name) && decl.name.text === method) {
                    lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                }
            }
        }
    });
    return lineNumber;
}
/**
 * Extract JSDoc description from a source file.
 */
function extractJSDocDescription(sourceFile) {
    const text = sourceFile.getFullText();
    const jsdocMatch = text.match(/\/\*\*\s*\n\s*\*\s*([^\n*]+)/);
    return jsdocMatch ? jsdocMatch[1].trim() : undefined;
}
