/**
 * External Call Extractor
 * Handles extraction of fetch, axios, and internal API calls.
 */
import ts from 'typescript';
import { ApiDependencies } from '../types';
import { ApiVizConfig, DEFAULT_CONFIG, matchesPattern } from '../../core/config';

/**
 * Extract external API calls (fetch/axios) including internal /api/* calls
 */
export function extractExternalCall(node: ts.CallExpression, deps: ApiDependencies, config: ApiVizConfig): void {
    const expr = node.expression;
    let callName: string | null = null;
    const externalPatterns = config.patterns?.external || DEFAULT_CONFIG.patterns.external || [];
    
    // Direct call: fetch('url')
    if (ts.isIdentifier(expr)) {
        callName = expr.text;
    }
    // Method call: axios.get('url')
    else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        callName = expr.expression.text;
    }
    
    // Check if call matches configured patterns
    // We check exact match for function names like 'fetch' or module names 'axios'
    if (!callName || !matchesPattern(callName, externalPatterns)) return;
    
    // Try to extract URL from first argument
    if (node.arguments.length === 0) return;
    
    const firstArg = node.arguments[0];
    let url = '';
    
    if (ts.isStringLiteral(firstArg)) {
        url = firstArg.text;
    } else if (ts.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text;
    } else if (ts.isNoSubstitutionTemplateLiteral(firstArg)) {
        url = firstArg.text;
    }
    
    if (!url) return;
    
    // Track internal API calls separately
    if (url.startsWith('/api/') || url.startsWith('/api')) {
        deps.apiCalls.push(url.split('?')[0]); // Remove query params
        deps.external.push({
            name: `${callName}()`,
            module: url,
            type: 'external',
            usage: `Internal: ${url}`,
        });
    }
    // Track external URLs
    else if (url.startsWith('http://') || url.startsWith('https://')) {
        deps.external.push({
            name: `${callName}()`,
            module: url,
            type: 'external',
            usage: url,
        });
    }
}
