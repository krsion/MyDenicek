/**
 * Centralized error handling for DenicekModel operations
 */

/**
 * Custom error class for Denicek operations
 */
export class DenicekError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly context?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'DenicekError';
    }
}

/**
 * Centralized error handler for model operations.
 * Logs errors consistently and can be extended for analytics/monitoring.
 */
export function handleModelError(
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
): void {
    console.error(`DenicekModel.${operation}:`, error, context ?? '');
}
