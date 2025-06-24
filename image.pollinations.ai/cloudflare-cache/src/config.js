/**
 * Configuration constants for the Cloudflare Cache Worker
 */

/**
 * Semantic cache similarity threshold
 * Images with similarity scores above this threshold will be served from semantic cache
 * Lower values = more aggressive caching but potentially less relevant matches
 * Higher values = more conservative caching but higher quality matches
 */
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  // TTL for cached images (1 year in seconds)
  MAX_AGE: 31536000,
  
  // Default image dimensions
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 1024,
  
  // Analytics sampling rate
  ANALYTICS_SAMPLE_RATE: 1.0
};

/**
 * Model configuration
 */
export const MODEL_CONFIG = {
  DEFAULT_MODEL: 'flux',
  SUPPORTED_MODELS: ['flux', 'turbo', 'sdxl']
};
