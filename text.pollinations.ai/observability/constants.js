/**
 * Shared constants for the observability system
 */

// Token calculation constants
export const TOKENS_PER_MILLION = 1_000_000;

// Token count limits (UInt32 max for safety)
export const MAX_TOKEN_COUNT = 4_294_967_295;
export const MIN_TOKEN_COUNT = 0;

// Cost precision limits
export const MIN_COST = 0;
export const MAX_COST = Number.MAX_SAFE_INTEGER;

// Default values
export const DEFAULT_PROVIDER = 'unknown';
export const DEFAULT_MODEL = 'unknown';
export const DEFAULT_USER = 'unknown';
export const DEFAULT_REFERRER = 'unknown';
