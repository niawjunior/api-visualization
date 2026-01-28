import { readTools } from './lib/read';
import { analyzeTools } from './lib/analyze';
export const fsTools = {
  ...readTools,
  ...analyzeTools,
};


