/**
 * Route Analyzer Types
 * Shared interfaces and types for the API route analyzer.
 */
import type ts from 'typescript';
export * from '../core/api-types';

import { 
    PropertySchema, 
    ObjectSchema, 
    ResponseSchema
} from '../core/api-types'; // Import for use in patterns

// ============================================================================
// Internal Types
// ============================================================================

export interface VariableInfo {
    name: string;
    type: ts.Type;
    initializer?: ts.Expression;
}

export interface ExtractionContext {
    checker: ts.TypeChecker;
    sourceFile: ts.SourceFile;
    variables: Map<string, VariableInfo>;
}

// ============================================================================
// Pattern System Types
// ============================================================================

export interface RequestPattern {
    name: string;
    priority: number;
    detect: (node: ts.Node, ctx: ExtractionContext) => boolean;
    extract: (node: ts.Node, ctx: ExtractionContext) => PropertySchema[];
}

export interface ResponsePattern {
    name: string;
    priority: number;
    detect: (node: ts.Node, ctx: ExtractionContext) => boolean;
    extract: (node: ts.Node, ctx: ExtractionContext) => ResponseSchema | null;
}

// ============================================================================
// Configuration
// ============================================================================

export const ROUTE_FILE_PATTERNS = [
    '**/app/**/route.ts',
    '**/app/**/route.tsx',
    '**/app/**/route.js',
    '**/pages/api/**/*.ts',
    '**/pages/api/**/*.tsx', 
    '**/pages/api/**/*.js',
];

export const IGNORED_DIRS = [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
];
