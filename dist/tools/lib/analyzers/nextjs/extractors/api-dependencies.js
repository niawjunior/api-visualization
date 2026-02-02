"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractApiDependencies = extractApiDependencies;
/**
 * API Dependencies Extractor
 * Extracts service, database, external API, and utility dependencies from API routes.
 */
const typescript_1 = __importDefault(require("typescript"));
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
function extractApiDependencies(ctx, functionBody, sourceFile) {
    const dependencies = {
        services: [],
        database: [],
        external: [],
        utilities: [],
        grouped: [],
        tables: [],
        apiCalls: [],
    };
    // 1. Extract from import statements
    extractFromImports(sourceFile, dependencies);
    // 2. Extract from function calls (external URLs, database, API calls)
    extractFromFunctionCalls(ctx.checker, functionBody, dependencies);
    // Deduplicate
    deduplicateDependencies(dependencies);
    // 3. Group by module for UI display
    dependencies.grouped = groupByModule(dependencies);
    // 4. Deduplicate tables and apiCalls
    dependencies.tables = [...new Set(dependencies.tables)];
    dependencies.apiCalls = [...new Set(dependencies.apiCalls)];
    return dependencies;
}
// ============================================================================
// Import Analysis
// ============================================================================
function extractFromImports(sourceFile, deps) {
    typescript_1.default.forEachChild(sourceFile, (node) => {
        if (!typescript_1.default.isImportDeclaration(node))
            return;
        if (!typescript_1.default.isStringLiteral(node.moduleSpecifier))
            return;
        const importPath = node.moduleSpecifier.text;
        const importedNames = getImportedNames(node);
        // Categorize the import
        const category = categorizeImport(importPath);
        if (!category)
            return;
        for (const name of importedNames) {
            const info = {
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
function getImportedNames(node) {
    const names = [];
    const clause = node.importClause;
    if (!clause)
        return names;
    // Default import: import foo from 'module'
    if (clause.name) {
        names.push(clause.name.text);
    }
    // Named imports: import { a, b } from 'module'
    if (clause.namedBindings) {
        if (typescript_1.default.isNamedImports(clause.namedBindings)) {
            for (const element of clause.namedBindings.elements) {
                names.push(element.name.text);
            }
        }
        else if (typescript_1.default.isNamespaceImport(clause.namedBindings)) {
            // import * as foo from 'module'
            names.push(clause.namedBindings.name.text);
        }
    }
    return names;
}
function categorizeImport(importPath) {
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
function extractFromFunctionCalls(checker, functionBody, deps) {
    function visit(node) {
        if (typescript_1.default.isCallExpression(node)) {
            extractExternalCall(node, deps);
            extractPrismaTableAccess(node, deps);
            extractDrizzleTableAccess(node, deps);
        }
        // Also check property access for prisma.model patterns
        if (typescript_1.default.isPropertyAccessExpression(node)) {
            extractPrismaModelAccess(node, deps);
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
}
/**
 * Extract Prisma table access: prisma.user.findMany(), prisma.post.create()
 */
function extractPrismaModelAccess(node, deps) {
    // Pattern: prisma.MODEL.method() -> prisma is identifier, MODEL is property
    if (!typescript_1.default.isPropertyAccessExpression(node.expression))
        return;
    const parent = node.expression;
    if (!typescript_1.default.isIdentifier(parent.expression))
        return;
    const potentialPrisma = parent.expression.text.toLowerCase();
    if (!['prisma', 'db', 'client'].includes(potentialPrisma))
        return;
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
function extractPrismaTableAccess(node, deps) {
    // Already handled in extractPrismaModelAccess via property access
}
/**
 * Extract Drizzle table access: db.select().from(usersTable), db.insert(usersTable)
 */
function extractDrizzleTableAccess(node, deps) {
    const expr = node.expression;
    // Look for .from(table) or .insert(table).into(table)
    if (typescript_1.default.isPropertyAccessExpression(expr)) {
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
function extractTableName(arg) {
    if (typescript_1.default.isIdentifier(arg)) {
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
function extractExternalCall(node, deps) {
    const expr = node.expression;
    let callName = null;
    // Direct call: fetch('url')
    if (typescript_1.default.isIdentifier(expr)) {
        callName = expr.text;
    }
    // Method call: axios.get('url')
    else if (typescript_1.default.isPropertyAccessExpression(expr) && typescript_1.default.isIdentifier(expr.expression)) {
        callName = expr.expression.text;
    }
    if (!callName || !EXTERNAL_CALL_PATTERNS.includes(callName))
        return;
    // Try to extract URL from first argument
    if (node.arguments.length === 0)
        return;
    const firstArg = node.arguments[0];
    let url = '';
    if (typescript_1.default.isStringLiteral(firstArg)) {
        url = firstArg.text;
    }
    else if (typescript_1.default.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text;
    }
    else if (typescript_1.default.isNoSubstitutionTemplateLiteral(firstArg)) {
        url = firstArg.text;
    }
    if (!url)
        return;
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
function deduplicateDependencies(deps) {
    const dedupe = (arr) => {
        const seen = new Set();
        return arr.filter(d => {
            const key = `${d.name}:${d.module}`;
            if (seen.has(key))
                return false;
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
function groupByModule(deps) {
    const grouped = [];
    const moduleMap = new Map();
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
            const existing = moduleMap.get(key);
            if (!existing.items.includes(dep.name)) {
                existing.items.push(dep.name);
                existing.count = existing.items.length;
            }
        }
        else {
            // Create display label - shorten long paths
            let moduleLabel = dep.module;
            if (moduleLabel.startsWith('@/')) {
                moduleLabel = moduleLabel.replace('@/', '');
            }
            else if (moduleLabel.includes('/')) {
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
