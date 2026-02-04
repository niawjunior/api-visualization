
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface DependencyInfo {
    name: string;
    module: string;
    type: 'service' | 'database' | 'external' | 'utility';
    usage?: string;
}

export interface GroupedDependency {
    module: string;
    moduleLabel: string;
    type: 'service' | 'database' | 'external' | 'utility';
    items: string[];
    count: number;
}

export interface LocalApiDependencies {
    services: DependencyInfo[];
    database: DependencyInfo[];
    external: DependencyInfo[];
    utilities: DependencyInfo[];
    grouped?: GroupedDependency[];
    tables?: string[];
    apiCalls?: string[];
}

export interface SchemaField {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    children?: SchemaField[];
}

export interface LocalApiEndpoint {
    path: string;
    methods: HttpMethod[];
    params: { name: string; type: string; required: boolean; description?: string }[];
    queryParams: { name: string; type: string; required: boolean }[];
    requestBody?: SchemaField[];
    responseBody?: SchemaField[];
    dependencies?: LocalApiDependencies;
    filePath: string;
    relativePath: string;
    lineNumber: number;
    functionName?: string;
    description?: string;
}
