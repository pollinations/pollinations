import debug from 'debug';

const log = debug('app:errors');

/**
 * Known error types that should cause process exit
 */
export class FatalTokenError extends Error {
  constructor(context: string) {
    super(`Token error in ${context}`);
    this.name = 'FatalTokenError';
  }
}

export class NetworkTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`);
    this.name = 'NetworkTimeoutError';
  }
}

/**
 * Check if an error indicates invalid/missing Discord token
 */
export function isFatalTokenError(error: any): boolean {
  return error?.message?.includes('Expected token to be set for this request') || 
         error?.code === 'TOKEN_INVALID';
}

/**
 * Handle Discord API errors - throws FatalTokenError for token issues, logs others
 */
export function handleDiscordError(error: any, context: string, botName: string): void {
  if (isFatalTokenError(error)) {
    log('FATAL: Token error in %s for %s. Exiting process.', context, botName);
    throw new FatalTokenError(`${context} for ${botName}`);
  }
  
  log('Discord API error in %s for %s: %O', context, botName, error);
}

/**
 * Handle API generation errors - throws NetworkTimeoutError for timeouts, logs others
 */
export function handleApiError(error: any, context: string): string {
  if (error.message?.includes('Request timed out') || error.code === 'TIMEOUT') {
    throw new NetworkTimeoutError(50000);
  }
  
  log('API error in %s: %O', context, error);
  return ''; // Return empty string for non-fatal errors
}

/**
 * Top-level error handler that exits process for fatal errors
 */
export function handleFatalError(error: any): void {
  if (error instanceof FatalTokenError) {
    log('Fatal token error: %s', error.message);
    process.exit(1);
  }
  
  // Re-throw non-fatal errors
  throw error;
}

/**
 * Async wrapper that handles fatal errors
 */
export async function withFatalErrorHandling<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FatalTokenError) {
      handleFatalError(error);
      return undefined; // Never reached
    }
    // Log and continue for non-fatal errors
    log('Non-fatal error: %O', error);
    return undefined;
  }
}
