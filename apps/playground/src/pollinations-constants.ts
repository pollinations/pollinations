/**
 * Constants for Pollinations API configuration
 */

/**
 * Legacy API endpoints (deprecated, use new endpoints for new projects)
 */
export const LEGACY_API_ENDPOINTS = {
  /** Legacy language model endpoint */
  LANGUAGE: 'https://text.pollinations.ai/openai',
  /** Legacy image model endpoint */
  IMAGE: 'https://image.pollinations.ai/prompt',
  /** Legacy default image base URL */
  IMAGE_BASE: 'https://image.pollinations.ai',
} as const;

/**
 * New unified API endpoints (recommended)
 */
export const API_ENDPOINTS = {
  /** New language model endpoint */
  LANGUAGE: 'https://gen.pollinations.ai/v1/chat/completions',
  /** New image model endpoint */
  IMAGE: 'https://gen.pollinations.ai/image',
} as const;

/**
 * API key parameter names
 */
export const API_KEY_PARAMS = {
  /** Legacy API key parameter name (for query string) */
  LEGACY: 'token',
  /** New API key parameter name (for query string) */
  NEW: 'key',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  /** Default provider name */
  PROVIDER_NAME: 'pollinations',
  /** Default content type for requests */
  CONTENT_TYPE: 'application/json',
  /** Environment variable name for API key */
  API_KEY_ENV_VAR: 'POLLINATIONS_API_KEY',
} as const;

/**
 * External URLs
 */
export const EXTERNAL_URLS = {
  /** URL to get an API key */
  AUTH: 'https://enter.pollinations.ai',
} as const;
