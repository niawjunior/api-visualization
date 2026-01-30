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
    };
    // 1. Extract from import statements
    extractFromImports(sourceFile, dependencies);
    // 2. Extract from function calls (external URLs, dynamic imports)
    extractFromFunctionCalls(ctx.checker, functionBody, dependencies);
    // Deduplicate
    deduplicateDependencies(dependencies);
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
        // Look for fetch/axios calls with URL strings
        if (typescript_1.default.isCallExpression(node)) {
            extractExternalCall(node, deps);
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(functionBody);
}
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
    let url = 'unknown URL';
    if (typescript_1.default.isStringLiteral(firstArg)) {
        url = firstArg.text;
    }
    else if (typescript_1.default.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text + '...';
    }
    else if (typescript_1.default.isNoSubstitutionTemplateLiteral(firstArg)) {
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
