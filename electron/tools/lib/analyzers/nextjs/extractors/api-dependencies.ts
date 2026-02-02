/**
 * API Dependencies Extractor
 * Extracts service, database, external API, and utility dependencies from API routes.
 */
import ts from 'typescript';
import path from 'path';
import type { ExtractionContext, ApiDependencies, DependencyInfo, GroupedDependency } from '../types';
import { dependencyCache } from '../../core/cache';
import { ApiVizConfig, DEFAULT_CONFIG, matchesPattern } from '../../core/config';

// Re-export types for convenience
export type { ApiDependencies, DependencyInfo, GroupedDependency };

// ============================================================================
// Pattern Definitions
// ============================================================================

// Legacy patterns kept for fallback if needed, but we mostly use config now.
// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract dependencies from a function body.
 */
export function extractApiDependencies(
    ctx: ExtractionContext,
    functionBody: ts.Block,
    sourceFile: ts.SourceFile,
    useCache: boolean = true,
    config: ApiVizConfig = DEFAULT_CONFIG
): ApiDependencies {
    // Check cache first
    if (useCache && sourceFile.fileName) {
        // We use sourceFile.fileName as the cache key
        const cached = dependencyCache.get(sourceFile.fileName);
        if (cached) {
            return cached as ApiDependencies;
        }
    }

    const dependencies: ApiDependencies = {
        services: [],
        database: [],
        external: [],
        utilities: [],
        grouped: [],
        tables: [],
        apiCalls: [],
    };
    
    // 1. Extract from import statements
    extractFromImports(sourceFile, dependencies, config);
    
    // 2. Extract from function calls (external URLs, database, API calls)
    extractFromFunctionCalls(ctx.checker, functionBody, dependencies, config);
    
    // Deduplicate
    deduplicateDependencies(dependencies);
    
    // 3. Group by module for UI display
    dependencies.grouped = groupByModule(dependencies);
    
    // 4. Deduplicate tables and apiCalls
    dependencies.tables = [...new Set(dependencies.tables)];
    dependencies.apiCalls = [...new Set(dependencies.apiCalls)];
    
    // Cache if enabled
    if (useCache && sourceFile.fileName) {
        dependencyCache.set(sourceFile.fileName, dependencies);
    }
    
    return dependencies;
}

// ============================================================================
// Import Analysis
// ============================================================================

function extractFromImports(sourceFile: ts.SourceFile, deps: ApiDependencies, config: ApiVizConfig): void {
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isImportDeclaration(node)) return;
        if (!ts.isStringLiteral(node.moduleSpecifier)) return;
        
        const importPath = node.moduleSpecifier.text;
        const importedNames = getImportedNames(node);
        
        // Categorize the import
        const category = categorizeImport(importPath, config);
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

function categorizeImport(importPath: string, config: ApiVizConfig): 'service' | 'database' | 'utility' | null {
    const patterns = config.patterns || DEFAULT_CONFIG.patterns;

    // Check database
    if (patterns.database && matchesPattern(importPath, patterns.database)) {
        return 'database';
    }
    
    // Check services
    if (patterns.services && matchesPattern(importPath, patterns.services)) {
        return 'service';
    }
    
    // Check utilities
    if (patterns.utilities && matchesPattern(importPath, patterns.utilities)) {
        return 'utility';
    }
    
    return null;
}

// ============================================================================
// Function Call Analysis
// ============================================================================

function extractFromFunctionCalls(
    checker: ts.TypeChecker,
    functionBody: ts.Block,
    deps: ApiDependencies,
    config: ApiVizConfig
): void {
    function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
            extractExternalCall(node, deps, config);
            extractPrismaTableAccess(node, deps); // Currently doesn't use config but could
            extractDrizzleTableAccess(node, deps); // Currently doesn't use config but could
        }
        
        // Also check property access for prisma.model patterns
        if (ts.isPropertyAccessExpression(node)) {
            extractPrismaModelAccess(node, deps, config);
        }
        
        ts.forEachChild(node, visit);
    }
    
    visit(functionBody);
}

/**
 * Extract Prisma table access: prisma.user.findMany(), prisma.post.create()
 */
function extractPrismaModelAccess(
    node: ts.PropertyAccessExpression, 
    deps: ApiDependencies,
    config: ApiVizConfig
): void {
    // Pattern: prisma.MODEL.method() -> prisma is identifier, MODEL is property
    if (!ts.isPropertyAccessExpression(node.expression)) return;
    
    const parent = node.expression;
    if (!ts.isIdentifier(parent.expression)) return;
    
    const potentialPrisma = parent.expression.text.toLowerCase();
    const validClientNames = config.database?.clientNames || DEFAULT_CONFIG.database.clientNames || [];
    
    if (!validClientNames.includes(potentialPrisma)) return;
    
    // The middle property is the model/table name
    const modelName = parent.name.text;
    
    // Common Prisma methods that indicate table access
    const prismaMethod = node.name.text;
    const prismaMethods = [
        'findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow',
        'create', 'createMany', 'update', 'updateMany', 'upsert',
        'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'
    ];
    
    if (prismaMethods.includes(prismaMethod)) {
        deps.tables.push(modelName);
    }
}

/**
 * Extract Prisma table access from call expressions
 */
function extractPrismaTableAccess(node: ts.CallExpression, deps: ApiDependencies): void {
    // Already handled in extractPrismaModelAccess via property access
}

/**
 * Extract Drizzle table access: db.select().from(usersTable), db.insert(usersTable)
 */
function extractDrizzleTableAccess(node: ts.CallExpression, deps: ApiDependencies): void {
    const expr = node.expression;
    
    // Look for .from(table) or .insert(table).into(table)
    if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text;
        
        // db.select().from(tableName)
        if (methodName === 'from' && node.arguments.length > 0) {
            const tableArg = node.arguments[0];
            const tableName = extractTableName(tableArg);
            if (tableName) {
                deps.tables.push(tableName);
            }
        }
        
        // db.insert(tableName) or db.update(tableName) or db.delete(tableName)
        if (['insert', 'update', 'delete'].includes(methodName) && node.arguments.length > 0) {
            const tableArg = node.arguments[0];
            const tableName = extractTableName(tableArg);
            if (tableName) {
                deps.tables.push(tableName);
            }
        }
    }
}

/**
 * Extract table name from identifier (e.g., usersTable -> users)
 */
function extractTableName(arg: ts.Expression): string | null {
    if (ts.isIdentifier(arg)) {
        let name = arg.text;
        // Remove common suffixes
        name = name.replace(/Table$/, '').replace(/Schema$/, '');
        // Convert camelCase to lowercase
        return name.toLowerCase();
    }
    return null;
}

/**
 * Extract external API calls (fetch/axios) including internal /api/* calls
 */
function extractExternalCall(node: ts.CallExpression, deps: ApiDependencies, config: ApiVizConfig): void {
    const expr = node.expression;
    let callName: string | null = null;
    const externalPatterns = config.patterns?.external || DEFAULT_CONFIG.patterns.external || [];
    
    // Direct call: fetch('url')
    if (ts.isIdentifier(expr)) {
        callName = expr.text;
    }
    // Method call: axios.get('url')
    else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        callName = expr.expression.text;
    }
    
    // Check if call matches configured patterns
    // We check exact match for function names like 'fetch' or module names 'axios'
    if (!callName || !matchesPattern(callName, externalPatterns)) return;
    
    // Try to extract URL from first argument
    if (node.arguments.length === 0) return;
    
    const firstArg = node.arguments[0];
    let url = '';
    
    if (ts.isStringLiteral(firstArg)) {
        url = firstArg.text;
    } else if (ts.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text;
    } else if (ts.isNoSubstitutionTemplateLiteral(firstArg)) {
        url = firstArg.text;
    }
    
    if (!url) return;
    
    // Track internal API calls separately
    if (url.startsWith('/api/') || url.startsWith('/api')) {
        deps.apiCalls.push(url.split('?')[0]); // Remove query params
        deps.external.push({
            name: `${callName}()`,
            module: url,
            type: 'external',
            usage: `Internal: ${url}`,
        });
    }
    // Track external URLs
    else if (url.startsWith('http://') || url.startsWith('https://')) {
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
