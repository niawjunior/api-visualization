"use strict";
/**
 * Import patterns for JavaScript/TypeScript files
 * Extracted for maintainability and testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALIAS_PREFIXES = exports.INDEX_FILES = exports.RESOLVABLE_EXTENSIONS = exports.SIDE_EFFECT_IMPORT_REGEX = exports.REQUIRE_REGEX = exports.DYNAMIC_IMPORT_REGEX = exports.ES_IMPORT_FROM_REGEX = void 0;
/**
 * Matches ES module imports:
 * - import x from 'path'
 * - import { x } from 'path'
 * - import * as x from 'path'
 * - export { x } from 'path'
 * - export * from 'path'
 */
exports.ES_IMPORT_FROM_REGEX = /(?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
/**
 * Matches dynamic imports:
 * - import('path')
 * - import("path")
 */
exports.DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
/**
 * Matches CommonJS require:
 * - require('path')
 * - require("path")
 */
exports.REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
/**
 * Matches side-effect imports:
 * - import 'path'
 * - import "path"
 */
exports.SIDE_EFFECT_IMPORT_REGEX = /import\s+['"]([^'"]+)['"]\s*;?/g;
/**
 * Extensions to try when resolving imports without extension
 */
exports.RESOLVABLE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json'];
/**
 * Index file names to try when resolving directory imports
 */
exports.INDEX_FILES = exports.RESOLVABLE_EXTENSIONS.map(ext => `index.${ext}`);
/**
 * Common alias prefixes used in JS/TS projects
 */
exports.ALIAS_PREFIXES = ['@/', '~/', '#/'];
