"use strict";
/**
 * API Endpoint Analyzer
 * Scans projects for API routes and extracts metadata
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeApiEndpoints = analyzeApiEndpoints;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
// --- Constants ---
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const NEXT_APP_ROUTER_PATTERNS = [
    '**/app/**/route.ts',
    '**/app/**/route.tsx',
    '**/app/**/route.js',
];
const NEXT_PAGES_API_PATTERNS = [
    '**/pages/api/**/*.ts',
    '**/pages/api/**/*.tsx',
    '**/pages/api/**/*.js',
];
const IGNORED_DIRS = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
];
// --- Utility Functions ---
/**
 * Convert file path to API route path
 * e.g., app/api/users/[id]/route.ts -> /api/users/[id]
 */
function filePathToRoutePath(filePath, rootPath) {
    let relativePath = path.relative(rootPath, filePath);
    // Handle App Router (remove route.ts suffix)
    if (relativePath.includes('/route.')) {
        relativePath = relativePath.replace(/\/route\.(ts|tsx|js)$/, '');
    }
    // Handle app directory prefix
    if (relativePath.startsWith('app/')) {
        relativePath = relativePath.replace(/^app/, '');
    }
    // Handle Pages API
    if (relativePath.startsWith('pages/')) {
        relativePath = relativePath.replace(/^pages/, '');
        relativePath = relativePath.replace(/\.(ts|tsx|js)$/, '');
    }
    // Ensure leading slash
    if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath;
    }
    return relativePath;
}
/**
 * Extract route parameters from path
 * e.g., /api/users/[id]/posts/[postId] -> [{ name: "id" }, { name: "postId" }]
 */
function extractRouteParams(routePath) {
    const params = [];
    // Match [param] and [...param] patterns
    const paramRegex = /\[(?:\.\.\.)?(\w+)\]/g;
    let match;
    while ((match = paramRegex.exec(routePath)) !== null) {
        params.push({
            name: match[1],
            type: 'string',
            required: true,
        });
    }
    return params;
}
/**
 * Extract HTTP methods from file content
 * Looks for exported functions named GET, POST, etc.
 */
function extractHttpMethods(content) {
    const methods = [];
    for (const method of HTTP_METHODS) {
        // Match: export async function GET, export function GET, export const GET
        const patterns = [
            new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`, 'm'),
            new RegExp(`export\\s+const\\s+${method}\\s*=`, 'm'),
            new RegExp(`export\\s+\\{[^}]*\\b${method}\\b[^}]*\\}`, 'm'),
        ];
        if (patterns.some(pattern => pattern.test(content))) {
            methods.push(method);
        }
    }
    return methods;
}
/**
 * Extract Zod schema fields from content
 */
function extractZodSchema(content, schemaName) {
    // Look for z.object({ ... }) patterns
    const schemaRegex = new RegExp(`${schemaName}\\s*=\\s*z\\.object\\(\\{([^}]+)\\}\\)`, 's');
    const match = content.match(schemaRegex);
    if (!match)
        return undefined;
    const fields = [];
    const schemaBody = match[1];
    // Parse individual fields: fieldName: z.string(), etc.
    const fieldRegex = /(\w+)\s*:\s*z\.(\w+)\(\)/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(schemaBody)) !== null) {
        fields.push({
            name: fieldMatch[1],
            type: fieldMatch[2],
            required: !schemaBody.includes(`${fieldMatch[1]}:`),
        });
    }
    return fields.length > 0 ? fields : undefined;
}
/**
 * Extract request body schema from route handler
 */
function extractRequestBody(content) {
    // Look for common patterns:
    // 1. const body = await req.json()
    // 2. const { field1, field2 } = await request.json()
    // 3. Zod validation: schema.parse(await req.json())
    // Try to find Zod schemas first (most accurate)
    const zodSchemas = ['bodySchema', 'requestSchema', 'inputSchema', 'createSchema', 'updateSchema'];
    for (const schemaName of zodSchemas) {
        const fields = extractZodSchema(content, schemaName);
        if (fields)
            return fields;
    }
    // Try to find inline z.object patterns in parse/safeParse
    const inlineZodRegex = /\.(?:parse|safeParse)\s*\([^)]*\)\s*;[^]*?z\.object\(\{([^}]+)\}\)/;
    let match = content.match(inlineZodRegex);
    if (match) {
        const fields = parseZodFields(match[1]);
        if (fields.length > 0)
            return fields;
    }
    // Look for TypeScript interface-typed body
    const typedBodyRegex = /(?:const|let)\s+(\w+)\s*:\s*(\w+)\s*=\s*await\s+(?:req|request)\.json\(\)/;
    match = content.match(typedBodyRegex);
    if (match) {
        const typeName = match[2];
        // Try to find the interface/type definition
        const interfaceFields = extractInterfaceFields(content, typeName);
        if (interfaceFields && interfaceFields.length > 0)
            return interfaceFields;
    }
    // Fallback: extract destructured fields from req.json() - type is unknown since we can't detect it
    const destructureRegex = /(?:const|let)\s+\{\s*([^}]+)\s*\}\s*=\s*await\s+(?:req|request)\.json\(\)/;
    match = content.match(destructureRegex);
    if (match) {
        const fieldNames = match[1].split(',').map(f => f.trim().split(':')[0].trim());
        return fieldNames.filter(Boolean).map(name => ({
            name,
            type: 'unknown', // Cannot determine type from destructuring
            required: true,
        }));
    }
    return undefined;
}
/**
 * Parse Zod field definitions from string
 */
function parseZodFields(schemaBody) {
    const fields = [];
    const fieldRegex = /(\w+)\s*:\s*z\.(\w+)\(/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(schemaBody)) !== null) {
        fields.push({
            name: fieldMatch[1],
            type: fieldMatch[2],
            required: !schemaBody.includes(`${fieldMatch[1]}:`),
        });
    }
    return fields;
}
/**
 * Extract fields from TypeScript interface
 */
function extractInterfaceFields(content, typeName) {
    const interfaceRegex = new RegExp(`(?:interface|type)\\s+${typeName}\\s*(?:=\\s*)?\\{([^}]+)\\}`, 's');
    const match = content.match(interfaceRegex);
    if (!match)
        return undefined;
    const fields = [];
    const body = match[1];
    // Match: fieldName: type or fieldName?: type
    const fieldRegex = /(\w+)(\?)?:\s*([^;,\n]+)/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        fields.push({
            name: fieldMatch[1],
            type: fieldMatch[3].trim(),
            required: !fieldMatch[2],
        });
    }
    return fields.length > 0 ? fields : undefined;
}
/**
 * Extract response schema from route handler
 */
function extractResponseBody(content) {
    // Look for NextResponse.json({ ... }) or Response.json({ ... })
    const responseRegex = /(?:NextResponse|Response)\.json\(\s*\{([^}]+)\}/;
    const match = content.match(responseRegex);
    if (match) {
        const fieldNames = [];
        const body = match[1];
        // Extract field names from object literal
        const fieldRegex = /(\w+)\s*[,:]/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(body)) !== null) {
            if (!fieldNames.includes(fieldMatch[1])) {
                fieldNames.push(fieldMatch[1]);
            }
        }
        return fieldNames.map(name => ({
            name,
            type: 'unknown', // Cannot determine type from response object literal
            required: true,
        }));
    }
    return undefined;
}
/**
 * Find line number of first HTTP method export
 */
function findMethodLineNumber(content, methods) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const method of methods) {
            if (line.includes(`function ${method}`) || line.includes(`const ${method}`)) {
                return i + 1;
            }
        }
    }
    return 1;
}
/**
 * Extract JSDoc description from content
 */
function extractDescription(content) {
    // Look for top-level JSDoc comment
    const jsdocRegex = /\/\*\*\s*\n\s*\*\s*([^\n*]+)/;
    const match = content.match(jsdocRegex);
    return match ? match[1].trim() : undefined;
}
// --- Main Analysis Function ---
async function analyzeApiEndpoints(rootPath) {
    const endpoints = [];
    // Find all route files
    const allPatterns = [...NEXT_APP_ROUTER_PATTERNS, ...NEXT_PAGES_API_PATTERNS];
    const files = await (0, glob_1.glob)(allPatterns, {
        cwd: rootPath,
        ignore: IGNORED_DIRS,
        absolute: true,
    });
    // Process each file
    for (const filePath of files) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const routePath = filePathToRoutePath(filePath, rootPath);
            const methods = extractHttpMethods(content);
            // Skip files with no HTTP methods (not actually route handlers)
            if (methods.length === 0)
                continue;
            const endpoint = {
                path: routePath,
                methods,
                params: extractRouteParams(routePath),
                queryParams: [], // TODO: Extract from searchParams usage
                requestBody: extractRequestBody(content),
                responseBody: extractResponseBody(content),
                filePath,
                relativePath: path.relative(rootPath, filePath),
                lineNumber: findMethodLineNumber(content, methods),
                description: extractDescription(content),
            };
            endpoints.push(endpoint);
        }
        catch (error) {
            console.error(`Failed to analyze ${filePath}:`, error);
        }
    }
    // Sort by path
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    return endpoints;
}
// Worker message handler
if (typeof self !== 'undefined') {
    const { parentPort } = require('worker_threads');
    parentPort?.on('message', async (msg) => {
        if (msg.type === 'api') {
            try {
                const results = await analyzeApiEndpoints(msg.payload.path);
                parentPort?.postMessage({ type: 'success', results });
            }
            catch (error) {
                parentPort?.postMessage({ type: 'error', error: error.message });
            }
        }
    });
}
