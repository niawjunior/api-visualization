/**
 * Path Utilities
 * Helper functions for route path manipulation.
 */
import ts from 'typescript';
import path from 'path';
import type { PropertySchema } from '../types';

// ============================================================================
// Route Path Conversion
// ============================================================================

/**
 * Convert a file path to an API route path.
 * Example: "app/api/users/route.ts" -> "/api/users"
 */
export function filePathToRoutePath(filePath: string, rootPath: string): string {
    let relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
    
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
export function extractRouteParams(routePath: string): PropertySchema[] {
    const params: PropertySchema[] = [];
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
export function findMethodLineNumber(sourceFile: ts.SourceFile, method: string): number {
    let lineNumber = 1;
    
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === method) {
            lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        }
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === method) {
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
export function extractJSDocDescription(sourceFile: ts.SourceFile): string | undefined {
    const text = sourceFile.getFullText();
    const jsdocMatch = text.match(/\/\*\*\s*\n\s*\*\s*([^\n*]+)/);
    return jsdocMatch ? jsdocMatch[1].trim() : undefined;
}
