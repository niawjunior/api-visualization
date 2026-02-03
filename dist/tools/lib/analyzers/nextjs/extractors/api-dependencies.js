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
const cache_1 = require("../../core/cache");
const config_1 = require("../../core/config");
// ============================================================================
// Pattern Definitions
// ============================================================================
const prisma_1 = require("./prisma");
const drizzle_1 = require("./drizzle");
const external_calls_1 = require("./external-calls");
// Legacy patterns kept for fallback if needed, but we mostly use config now.
// ============================================================================
// Main Extraction Function
// ============================================================================
/**
 * Extract dependencies from a function body.
 */
function extractApiDependencies(ctx, functionBody, sourceFile, useCache = true, config = config_1.DEFAULT_CONFIG) {
    // Check cache first
    if (useCache && sourceFile.fileName) {
        // We use sourceFile.fileName as the cache key
        const cached = cache_1.dependencyCache.get(sourceFile.fileName);
        if (cached) {
            return cached;
        }
    }
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
        cache_1.dependencyCache.set(sourceFile.fileName, dependencies);
    }
    return dependencies;
}
// ============================================================================
// Import Analysis
// ============================================================================
function extractFromImports(sourceFile, deps, config) {
    typescript_1.default.forEachChild(sourceFile, (node) => {
        if (!typescript_1.default.isImportDeclaration(node))
            return;
        if (!typescript_1.default.isStringLiteral(node.moduleSpecifier))
            return;
        const importPath = node.moduleSpecifier.text;
        const importedNames = getImportedNames(node);
        // Categorize the import
        const category = categorizeImport(importPath, config);
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
function categorizeImport(importPath, config) {
    const patterns = config.patterns || config_1.DEFAULT_CONFIG.patterns;
    // Check database
    if (patterns.database && (0, config_1.matchesPattern)(importPath, patterns.database)) {
        return 'database';
    }
    // Check services
    if (patterns.services && (0, config_1.matchesPattern)(importPath, patterns.services)) {
        return 'service';
    }
    // Check utilities
    if (patterns.utilities && (0, config_1.matchesPattern)(importPath, patterns.utilities)) {
        return 'utility';
    }
    return null;
}
// ============================================================================
// Function Call Analysis
// ============================================================================
function extractFromFunctionCalls(checker, functionBody, deps, config) {
    function visit(node) {
        if (typescript_1.default.isCallExpression(node)) {
            (0, external_calls_1.extractExternalCall)(node, deps, config);
            (0, drizzle_1.extractDrizzleTableAccess)(node, deps);
        }
        // Also check property access for prisma.model patterns
        if (typescript_1.default.isPropertyAccessExpression(node)) {
            (0, prisma_1.extractPrismaModelAccess)(node, deps, config);
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
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
