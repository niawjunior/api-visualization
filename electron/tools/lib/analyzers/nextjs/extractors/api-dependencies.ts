/**
 * API Dependencies Extractor
 * Extracts service, database, external API, and utility dependencies from API routes.
 */
import ts from 'typescript';
import path from 'path';
import type { ExtractionContext, ApiDependencies, DependencyInfo, GroupedDependency } from '../types';

// Re-export types for convenience
export type { ApiDependencies, DependencyInfo, GroupedDependency };

// ============================================================================
// Pattern Definitions
// ============================================================================

const SERVICE_PATTERNS = [
    /^@\/lib\//,
    /^@\/services\//,
    /^@\/server\//,
    /^\.\.?\/lib\//,
    /^\.\.?\/services\//,
];

const DATABASE_PATTERNS = [
    '@prisma/client',
    '@supabase/supabase-js',
    'mongoose',
    'drizzle-orm',
    'kysely',
    'sequelize',
    'typeorm',
    '@neondatabase',
    '@planetscale',
];

const UTILITY_PATTERNS = [
    /^@\/utils\//,
    /^@\/helpers\//,
    /^@\/config\//,
    /^\.\.?\/utils\//,
];

const EXTERNAL_CALL_PATTERNS = [
    'fetch',
    'axios',
];

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract dependencies from a function body.
 */
export function extractApiDependencies(
    ctx: ExtractionContext,
    functionBody: ts.Block,
    sourceFile: ts.SourceFile
): ApiDependencies {
    const dependencies: ApiDependencies = {
        services: [],
        database: [],
        external: [],
        utilities: [],
        grouped: [],
    };
    
    // 1. Extract from import statements
    extractFromImports(sourceFile, dependencies);
    
    // 2. Extract from function calls (external URLs, dynamic imports)
    extractFromFunctionCalls(ctx.checker, functionBody, dependencies);
    
    // Deduplicate
    deduplicateDependencies(dependencies);
    
    // 3. Group by module for UI display
    dependencies.grouped = groupByModule(dependencies);
    
    return dependencies;
}

// ============================================================================
// Import Analysis
// ============================================================================

function extractFromImports(sourceFile: ts.SourceFile, deps: ApiDependencies): void {
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isImportDeclaration(node)) return;
        if (!ts.isStringLiteral(node.moduleSpecifier)) return;
        
        const importPath = node.moduleSpecifier.text;
        const importedNames = getImportedNames(node);
        
        // Categorize the import
        const category = categorizeImport(importPath);
        if (!category) return;
        
        for (const name of importedNames) {
            const info: DependencyInfo = {
                name,
                module: importPath,
                type: category,
            };
            
            switch (category) {
                case 'service':
                    deps.services.push(info);
                    break;
                case 'database':
                    deps.database.push(info);
                    break;
                case 'utility':
                    deps.utilities.push(info);
                    break;
            }
        }
    });
}

function getImportedNames(node: ts.ImportDeclaration): string[] {
    const names: string[] = [];
    const clause = node.importClause;
    
    if (!clause) return names;
    
    // Default import: import foo from 'module'
    if (clause.name) {
        names.push(clause.name.text);
    }
    
    // Named imports: import { a, b } from 'module'
    if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
            for (const element of clause.namedBindings.elements) {
                names.push(element.name.text);
            }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
            // import * as foo from 'module'
            names.push(clause.namedBindings.name.text);
        }
    }
    
    return names;
}

function categorizeImport(importPath: string): 'service' | 'database' | 'utility' | null {
    // Check database
    for (const pattern of DATABASE_PATTERNS) {
        if (importPath.includes(pattern)) {
            return 'database';
        }
    }
    
    // Check services
    for (const pattern of SERVICE_PATTERNS) {
        if (pattern.test(importPath)) {
            return 'service';
        }
    }
    
    // Check utilities
    for (const pattern of UTILITY_PATTERNS) {
        if (pattern.test(importPath)) {
            return 'utility';
        }
    }
    
    return null;
}

// ============================================================================
// Function Call Analysis
// ============================================================================

function extractFromFunctionCalls(
    checker: ts.TypeChecker,
    functionBody: ts.Block,
    deps: ApiDependencies
): void {
    function visit(node: ts.Node) {
        // Look for fetch/axios calls with URL strings
        if (ts.isCallExpression(node)) {
            extractExternalCall(node, deps);
        }
        
        ts.forEachChild(node, visit);
    }
    
    visit(functionBody);
}

function extractExternalCall(node: ts.CallExpression, deps: ApiDependencies): void {
    const expr = node.expression;
    let callName: string | null = null;
    
    // Direct call: fetch('url')
    if (ts.isIdentifier(expr)) {
        callName = expr.text;
    }
    // Method call: axios.get('url')
    else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        callName = expr.expression.text;
    }
    
    if (!callName || !EXTERNAL_CALL_PATTERNS.includes(callName)) return;
    
    // Try to extract URL from first argument
    if (node.arguments.length === 0) return;
    
    const firstArg = node.arguments[0];
    let url = 'unknown URL';
    
    if (ts.isStringLiteral(firstArg)) {
        url = firstArg.text;
    } else if (ts.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text + '...';
    } else if (ts.isNoSubstitutionTemplateLiteral(firstArg)) {
        url = firstArg.text;
    }
    
    // Only track external URLs (http/https)
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api')) {
        deps.external.push({
            name: `${callName}()`,
            module: url,
            type: 'external',
            usage: url,
        });
    }
}

// ============================================================================
// Utilities
// ============================================================================

function deduplicateDependencies(deps: ApiDependencies): void {
    const dedupe = (arr: DependencyInfo[]) => {
        const seen = new Set<string>();
        return arr.filter(d => {
            const key = `${d.name}:${d.module}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    
    deps.services = dedupe(deps.services);
    deps.database = dedupe(deps.database);
    deps.external = dedupe(deps.external);
    deps.utilities = dedupe(deps.utilities);
}

/**
 * Group dependencies by module for cleaner UI display.
 * e.g., Instead of showing [eq, and, inArray] separately,
 * show "drizzle-orm (3 functions)"
 */
function groupByModule(deps: ApiDependencies): GroupedDependency[] {
    const grouped: GroupedDependency[] = [];
    const moduleMap = new Map<string, GroupedDependency>();
    
    // Collect all dependencies
    const allDeps = [
        ...deps.services,
        ...deps.database,
        ...deps.external,
        ...deps.utilities,
    ];
    
    for (const dep of allDeps) {
        const key = `${dep.module}:${dep.type}`;
        
        if (moduleMap.has(key)) {
            const existing = moduleMap.get(key)!;
            if (!existing.items.includes(dep.name)) {
                existing.items.push(dep.name);
                existing.count = existing.items.length;
            }
        } else {
            // Create display label - shorten long paths
            let moduleLabel = dep.module;
            if (moduleLabel.startsWith('@/')) {
                moduleLabel = moduleLabel.replace('@/', '');
            } else if (moduleLabel.includes('/')) {
                // Take last segment for external modules
                const parts = moduleLabel.split('/');
                moduleLabel = parts[parts.length - 1] || moduleLabel;
            }
            
            moduleMap.set(key, {
                module: dep.module,
                moduleLabel,
                type: dep.type,
                items: [dep.name],
                count: 1,
            });
        }
    }
    
    return Array.from(moduleMap.values());
}
