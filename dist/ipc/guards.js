"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPathAllowed = void 0;
/**
 * Security Guards
 * Utilities for validating paths and permissions.
 */
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
/**
 * Validate paths are within allowed directories (Home directory)
 */
const isPathAllowed = (targetPath) => {
    try {
        const home = os_1.default.homedir();
        const resolved = path_1.default.resolve(targetPath);
        // Allow paths within home directory only
        return resolved.startsWith(home);
    }
    catch (e) {
        return false;
    }
};
exports.isPathAllowed = isPathAllowed;
