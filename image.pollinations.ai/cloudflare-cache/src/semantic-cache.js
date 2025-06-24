/**
 * Semantic Cache for Vectorize Image Caching
 * Based on GitHub issue #2562 research and Cloudflare Vectorize V2 API
 * Uses metadata filtering and indexed properties for optimal performance
 */

import { createEmbeddingService, generateEmbedding, getResolutionBucket } from './embedding-service.js';

/**
 * Create a semantic cache instance
 * @param {Object} env - Environment bindings
 * @returns {Object} - Semantic cache instance
 */
export function createSemanticCache(env) {
  return {
    r2: env.IMAGE_BUCKET,
    vectorize: env.VECTORIZE_INDEX,
    ai: env.AI,
    similarityThreshold: 0.85, // Conservative threshold for production
    embeddingService: createEmbeddingService(env.AI)
  };
}

/**
 * Find similar image in cache using Vectorize V2 metadata filtering
 * @param {Object} cache - Semantic cache instance
 * @param {string} prompt - Image prompt
 * @param {Object} params - Request parameters
 * @returns {Promise<Object|null>} - Similar image info or null
 */
export async function findSimilarImage(cache, prompt, params = {}) {
  try {
    console.log(`[SEMANTIC] Searching for similar image: "${prompt.substring(0, 50)}..."`);
    
    // Generate embedding for the prompt
    const embedding = await generateEmbedding(cache.embeddingService, prompt, params);
    
    // Get resolution bucket for filtering
    const width = parseInt(params.width) || 1024;
    const height = parseInt(params.height) || 1024;
    const bucket = getResolutionBucket(width, height);
    
    console.log(`[SEMANTIC] Searching in resolution bucket: ${bucket}`);
    
    // Search Vectorize with metadata filtering for efficiency
    const searchResults = await cache.vectorize.query(embedding, {
      topK: 5,
      returnValues: false,
      returnMetadata: 'indexed', // Fast queries using indexed metadata
      filter: {
        bucket: { $eq: bucket },
        model: { $eq: params.model || 'flux' }
      }
    });
    
    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log('[SEMANTIC] No similar images found in cache');
      return null;
    }
    
    // Return best match above similarity threshold
    const bestMatch = searchResults.matches[0];
    if (bestMatch.score >= cache.similarityThreshold) {
      console.log(`[SEMANTIC] Found similar image with score: ${bestMatch.score.toFixed(3)}`);
      return {
        cacheKey: bestMatch.metadata.cacheKey,
        similarity: bestMatch.score,
        bucket: bucket
      };
    }
    
    console.log(`[SEMANTIC] Best similarity ${bestMatch.score.toFixed(3)} below threshold ${cache.similarityThreshold}`);
    return null;
    
  } catch (error) {
    console.error('[SEMANTIC] Error finding similar image:', error);
    return null; // Graceful fallback to exact cache
  }
}

/**
 * Cache image embedding in Vectorize asynchronously
 * @param {Object} cache - Semantic cache instance  
 * @param {string} cacheKey - R2 cache key
 * @param {string} prompt - Image prompt
 * @param {Object} params - Request parameters
 */
export async function cacheImageEmbedding(cache, cacheKey, prompt, params = {}) {
  try {
    console.log(`[SEMANTIC] Caching embedding for: ${cacheKey}`);
    
    // Generate embedding for the prompt
    const embedding = await generateEmbedding(cache.embeddingService, prompt, params);
    
    // Get resolution bucket
    const width = parseInt(params.width) || 1024;
    const height = parseInt(params.height) || 1024;
    const bucket = getResolutionBucket(width, height);
    
    // Store in Vectorize with indexed metadata for fast filtering
    await cache.vectorize.upsert([{
      id: cacheKey,
      values: embedding,
      metadata: {
        cacheKey: cacheKey,
        bucket: bucket,
        model: params.model || 'flux',
        width: width,
        height: height,
        cachedAt: Date.now()
      }
    }]);
    
    console.log(`[SEMANTIC] Cached embedding in bucket: ${bucket}`);
    
  } catch (error) {
    console.error('[SEMANTIC] Error caching embedding:', error);
    // Don't throw - this is asynchronous and shouldn't break the request
  }
}
