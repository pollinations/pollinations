/**
 * Configuration constants for the Cloudflare Cache Worker
 */

/**
 * Enable or disable semantic cache functionality
 * Set to false to disable semantic caching entirely (fallback to exact cache only)
 * Set to true to enable semantic caching with BGE embeddings
 */
export const SEMANTIC_CACHE_ENABLED = false;

/**
 * Semantic cache similarity threshold
 * Images with similarity scores above this threshold will be served from semantic cache
 * Lower values = more aggressive caching but potentially less relevant matches
 * Higher values = more conservative caching but higher quality matches
 */
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.8;
