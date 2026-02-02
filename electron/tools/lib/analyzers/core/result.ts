/**
 * Result type for type-safe error handling
 * Replaces nullable returns with explicit success/failure states
 */

export type Result<T, E = AnalysisError> =
    | { ok: true; value: T }
    | { ok: false; error: E };

export interface AnalysisError {
    code: AnalysisErrorCode;
    message: string;
    filePath?: string;
    line?: number;
    details?: unknown;
}

export enum AnalysisErrorCode {
    // File errors
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    FILE_READ_ERROR = 'FILE_READ_ERROR',
    
    // Parse errors
    PARSE_ERROR = 'PARSE_ERROR',
    INVALID_SYNTAX = 'INVALID_SYNTAX',
    
    // Extraction errors
    EXTRACTION_FAILED = 'EXTRACTION_FAILED',
    TYPE_RESOLUTION_FAILED = 'TYPE_RESOLUTION_FAILED',
    
    // Config errors
    INVALID_CONFIG = 'INVALID_CONFIG',
    
    // General
    UNKNOWN = 'UNKNOWN',
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

/**
 * Create a failed result
 */
export function err<E = AnalysisError>(error: E): Result<never, E> {
    return { ok: false, error };
}

/**
 * Create an AnalysisError
 */
export function analysisError(
    code: AnalysisErrorCode,
    message: string,
    options?: {
        filePath?: string;
        line?: number;
        details?: unknown;
    }
): AnalysisError {
    return {
        code,
        message,
        ...options,
    };
}

/**
 * Wrap a function that might throw in a Result
 */
export function tryCatch<T>(
    fn: () => T,
    errorHandler?: (e: unknown) => AnalysisError
): Result<T> {
    try {
        return ok(fn());
    } catch (e) {
        if (errorHandler) {
            return err(errorHandler(e));
        }
        return err(analysisError(
            AnalysisErrorCode.UNKNOWN,
            e instanceof Error ? e.message : 'Unknown error',
            { details: e }
        ));
    }
}

/**
 * Wrap an async function that might throw in a Result
 */
export async function tryCatchAsync<T>(
    fn: () => Promise<T>,
    errorHandler?: (e: unknown) => AnalysisError
): Promise<Result<T>> {
    try {
        return ok(await fn());
    } catch (e) {
        if (errorHandler) {
            return err(errorHandler(e));
        }
        return err(analysisError(
            AnalysisErrorCode.UNKNOWN,
            e instanceof Error ? e.message : 'Unknown error',
            { details: e }
        ));
    }
}

/**
 * Collect results, separating successes from failures
 */
export function collectResults<T, E = AnalysisError>(results: Result<T, E>[]): {
    successes: T[];
    errors: E[];
} {
    const successes: T[] = [];
    const errors: E[] = [];
    
    for (const result of results) {
        if (result.ok) {
            successes.push(result.value);
        } else {
            // TS sometimes fails to narrow in loops, force cast specific branch
            errors.push((result as { ok: false; error: E }).error);
        }
    }
    
    return { successes, errors };
}
