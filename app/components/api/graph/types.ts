export interface GroupedDependency {
  module: string;
  moduleLabel: string;
  type: 'service' | 'database' | 'external' | 'utility';
  items: string[];
  count: number;
}

export interface ApiDependencies {
  services: any[];
  database: any[];
  external: any[];
  utilities: any[];
  grouped?: GroupedDependency[];
  tables?: string[];
  apiCalls?: string[];
}

export interface EndpointSummary {
  path: string;
  methods: string[];
  filePath?: string;
  dependencies?: ApiDependencies;
}

export interface ApiDependencyGraphProps {
  endpoint: EndpointSummary;
  allEndpoints?: EndpointSummary[];
  onClose: () => void;
  onOpenFile?: (path: string, line?: number, app?: string) => void;
}
