"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IGNORED_DIRS = exports.ROUTE_FILE_PATTERNS = exports.HTTP_METHODS = void 0;
// ============================================================================
// HTTP Methods
// ============================================================================
exports.HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
// ============================================================================
// Configuration
// ============================================================================
exports.ROUTE_FILE_PATTERNS = [
    '**/app/**/route.ts',
    '**/app/**/route.tsx',
    '**/app/**/route.js',
    '**/pages/api/**/*.ts',
    '**/pages/api/**/*.tsx',
    '**/pages/api/**/*.js',
];
exports.IGNORED_DIRS = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
];
