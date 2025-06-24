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
