/**
 * Core Analyzer Interface
 * Defines the contract for API framework analyzers.
 */

import { ApiEndpoint } from './api-types';
import { ApiVizConfig } from './config';

/**
 * Interface that all API analyzers must implement
 */
export interface ApiAnalyzer {
    /** 
     * Unique name of the analyzer (e.g., "nextjs", "express") 
     */
    name: string;
    
    /**
     * Detect if this analyzer should be used for the given project
     */
    detect(projectPath: string, config: ApiVizConfig): Promise<boolean>;
    
    /**
     * Analyze the project and return API endpoints
     */
    analyze(projectPath: string, config: ApiVizConfig): Promise<ApiEndpoint[]>;
}
