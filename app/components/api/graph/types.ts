import { LocalApiEndpoint } from '../types';

export type { LocalApiEndpoint, GroupedDependency, DependencyInfo } from '../types';

export interface ApiDependencyGraphProps {
  endpoint: LocalApiEndpoint;
  allEndpoints?: LocalApiEndpoint[];
  onClose: () => void;
  onOpenFile?: (path: string, line?: number, app?: string) => void;
}
