"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractExternalCall = extractExternalCall;
/**
 * External Call Extractor
 * Handles extraction of fetch, axios, and internal API calls.
 */
const typescript_1 = __importDefault(require("typescript"));
const config_1 = require("../../core/config");
/**
 * Extract external API calls (fetch/axios) including internal /api/* calls
 */
function extractExternalCall(node, deps, config) {
    const expr = node.expression;
    let callName = null;
    const externalPatterns = config.patterns?.external || config_1.DEFAULT_CONFIG.patterns.external || [];
    // Direct call: fetch('url')
    if (typescript_1.default.isIdentifier(expr)) {
        callName = expr.text;
    }
    // Method call: axios.get('url')
    else if (typescript_1.default.isPropertyAccessExpression(expr) && typescript_1.default.isIdentifier(expr.expression)) {
        callName = expr.expression.text;
    }
    // Check if call matches configured patterns
    // We check exact match for function names like 'fetch' or module names 'axios'
    if (!callName || !(0, config_1.matchesPattern)(callName, externalPatterns))
        return;
    // Try to extract URL from first argument
    if (node.arguments.length === 0)
        return;
    const firstArg = node.arguments[0];
    let url = '';
    if (typescript_1.default.isStringLiteral(firstArg)) {
        url = firstArg.text;
    }
    else if (typescript_1.default.isTemplateExpression(firstArg) && firstArg.head) {
        url = firstArg.head.text;
    }
    else if (typescript_1.default.isNoSubstitutionTemplateLiteral(firstArg)) {
        url = firstArg.text;
    }
    if (!url)
        return;
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
