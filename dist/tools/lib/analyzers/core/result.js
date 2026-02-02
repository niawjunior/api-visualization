"use strict";
/**
 * Result type for type-safe error handling
 * Replaces nullable returns with explicit success/failure states
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisErrorCode = void 0;
exports.ok = ok;
exports.err = err;
exports.analysisError = analysisError;
exports.tryCatch = tryCatch;
exports.tryCatchAsync = tryCatchAsync;
exports.collectResults = collectResults;
var AnalysisErrorCode;
(function (AnalysisErrorCode) {
    // File errors
    AnalysisErrorCode["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
    AnalysisErrorCode["FILE_READ_ERROR"] = "FILE_READ_ERROR";
    // Parse errors
    AnalysisErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    AnalysisErrorCode["INVALID_SYNTAX"] = "INVALID_SYNTAX";
    // Extraction errors
    AnalysisErrorCode["EXTRACTION_FAILED"] = "EXTRACTION_FAILED";
    AnalysisErrorCode["TYPE_RESOLUTION_FAILED"] = "TYPE_RESOLUTION_FAILED";
    // Config errors
    AnalysisErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    // General
    AnalysisErrorCode["UNKNOWN"] = "UNKNOWN";
})(AnalysisErrorCode || (exports.AnalysisErrorCode = AnalysisErrorCode = {}));
// ============================================================================
// Helper functions
// ============================================================================
/**
 * Create a successful result
 */
function ok(value) {
    return { ok: true, value };
}
/**
 * Create a failed result
 */
function err(error) {
    return { ok: false, error };
}
/**
 * Create an AnalysisError
 */
function analysisError(code, message, options) {
    return {
        code,
        message,
        ...options,
    };
}
/**
 * Wrap a function that might throw in a Result
 */
function tryCatch(fn, errorHandler) {
    try {
        return ok(fn());
    }
    catch (e) {
        if (errorHandler) {
            return err(errorHandler(e));
        }
        return err(analysisError(AnalysisErrorCode.UNKNOWN, e instanceof Error ? e.message : 'Unknown error', { details: e }));
    }
}
/**
 * Wrap an async function that might throw in a Result
 */
async function tryCatchAsync(fn, errorHandler) {
    try {
        return ok(await fn());
    }
    catch (e) {
        if (errorHandler) {
            return err(errorHandler(e));
        }
        return err(analysisError(AnalysisErrorCode.UNKNOWN, e instanceof Error ? e.message : 'Unknown error', { details: e }));
    }
}
/**
 * Collect results, separating successes from failures
 */
function collectResults(results) {
    const successes = [];
    const errors = [];
    for (const result of results) {
        if (result.ok) {
            successes.push(result.value);
        }
        else {
            // TS sometimes fails to narrow in loops, force cast specific branch
            errors.push(result.error);
        }
    }
    return { successes, errors };
}
