/**
 * Core API Types
 * Framework-agnostic interfaces for API analysis.
 */

// ============================================================================
// HTTP Methods
// ============================================================================

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

// ============================================================================
// Property & Schema Types
// ============================================================================

export interface PropertySchema {
    name: string;
    type: string;
    optional: boolean;
    description?: string;
}

export interface ObjectSchema {
    properties: PropertySchema[];
}

export interface ResponseSchema {
    schema: ObjectSchema;
    statusCode?: number;
    isError: boolean;
}

// ============================================================================
// Dependency Types
// ============================================================================

export interface ApiDependencies {
    services: DependencyInfo[];     // @/lib/*, @/services/*
    database: DependencyInfo[];     // prisma, supabase, mongoose
    external: DependencyInfo[];     // fetch URLs, axios calls
    utilities: DependencyInfo[];    // shared helpers
    grouped: GroupedDependency[];   // Grouped by module for UI display
    tables: string[];               // Database tables accessed (e.g., ['users', 'posts'])
    apiCalls: string[];             // Internal API calls (e.g., ['/api/auth'])
}

export interface DependencyInfo {
    name: string;           // Function or module name
    module: string;         // Import path
    type: 'service' | 'database' | 'external' | 'utility';
    usage?: string;         // How it's used (optional context)
}

export interface GroupedDependency {
    module: string;         // Import path (e.g., 'drizzle-orm')
    moduleLabel: string;    // Display name (e.g., 'drizzle-orm')
    type: 'service' | 'database' | 'external' | 'utility';
    items: string[];        // Function names (e.g., ['eq', 'and', 'inArray'])
    count: number;          // Number of items
}

// ============================================================================
// Route Analysis Types
// ============================================================================

export interface RouteSchema {
    method: HttpMethod;
    path: string;
    filePath: string;
    requestBody?: ObjectSchema;
    queryParams?: ObjectSchema;
    responses: ResponseSchema[];
    dependencies?: ApiDependencies;
}

export interface ApiEndpoint {
    path: string;
    methods: HttpMethod[];
    params: PropertySchema[];
    queryParams: PropertySchema[];
    requestBody?: PropertySchema[];
    responseBody?: PropertySchema[];
    responses: Array<{
        statusCode?: number;
        isError: boolean;
        schema: PropertySchema[];
    }>;
    dependencies?: ApiDependencies;
    filePath: string;
    relativePath: string;
    lineNumber: number;
    functionName?: string;
    description?: string;
}

export interface RouteAnalysisResult {
    routes: RouteSchema[];
    errors: string[];
}
