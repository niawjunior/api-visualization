/**
 * Import patterns for JavaScript/TypeScript files
 * Extracted for maintainability and testing
 */

/**
 * Matches ES module imports:
 * - import x from 'path'
 * - import { x } from 'path'
 * - import * as x from 'path'
 * - export { x } from 'path'
 * - export * from 'path'
 */
export const ES_IMPORT_FROM_REGEX = /(?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Matches dynamic imports:
 * - import('path')
 * - import("path")
 */
export const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Matches CommonJS require:
 * - require('path')
 * - require("path")
 */
export const REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Matches side-effect imports:
 * - import 'path'
 * - import "path"
 */
export const SIDE_EFFECT_IMPORT_REGEX = /import\s+['"]([^'"]+)['"]\s*;?/g;

/**
 * Extensions to try when resolving imports without extension
 */
export const RESOLVABLE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json'];

/**
 * Index file names to try when resolving directory imports
 */
export const INDEX_FILES = RESOLVABLE_EXTENSIONS.map(ext => `index.${ext}`);

/**
 * Common alias prefixes used in JS/TS projects
 */
export const ALIAS_PREFIXES = ['@/', '~/', '#/'];
