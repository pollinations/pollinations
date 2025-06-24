/**
 * Semantic Cache for Vectorize Image Caching
 * Based on GitHub issue #2562 research and Cloudflare Vectorize V2 API
 * Uses metadata filtering and indexed properties for optimal performance
 */

import { createEmbeddingService, generateEmbedding, getResolutionBucket } from './embedding-service.js';
import { SEMANTIC_SIMILARITY_THRESHOLD } from './config.js';

/**
 * Create a simple hash for Vectorize ID (using Web Crypto API)
 * @param {string} input - Input string to hash
 * @returns {Promise<string>} - Hash string
 */
async function createSimpleHash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32); // Return first 32 chars
}

/**
 * Helper function to set HTTP metadata headers from R2 object
 * @param {Headers} headers - Headers object to populate
 * @param {Object} httpMetadata - R2 object httpMetadata
 */
function setHttpMetadataHeaders(headers, httpMetadata) {
  if (httpMetadata) {
    // Iterate over all httpMetadata and set headers
    for (const [key, value] of Object.entries(httpMetadata)) {
      if (value) {
        // Convert camelCase to kebab-case for HTTP headers
        const headerName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        headers.set(headerName, value);
      }
    }
  } else {
    // Fallback to default content type
    headers.set('content-type', 'image/jpeg');
  }
}

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
    similarityThreshold: SEMANTIC_SIMILARITY_THRESHOLD, // Centralized threshold configuration
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
    const seed = params.seed; // Extract seed parameter
    const bucket = getResolutionBucket(width, height, seed);
    
    console.log(`[SEMANTIC] Searching in resolution bucket: ${bucket}`);
    
    // Search Vectorize with metadata filtering for efficiency
    const searchResults = await cache.vectorize.query(embedding, {
      topK: 5,
      returnValues: false,
      returnMetadata: 'all', // Changed from 'indexed' to get all metadata including cacheKey
      filter: {
        bucket: { $eq: bucket },
        model: { $eq: params.model || 'flux' },
        ...(seed !== undefined && seed !== null && { seed: { $eq: seed } }) // Add seed filter when available
      }
    });
    
    console.log(`[SEMANTIC] Search results:`, {
      matchCount: searchResults.matches?.length || 0,
      searchQuery: { bucket, model: params.model || 'flux', seed: seed }
    });
    
    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log('[SEMANTIC] No similar images found in cache');
      return { bestSimilarity: null };
    }
    
    // Log all matches for debugging
    console.log('[SEMANTIC] Found matches:');
    searchResults.matches.forEach((match, index) => {
      const cacheKey = match.metadata?.cacheKey || match.id || 'unknown';
      console.log(`  ${index + 1}. ${cacheKey} - similarity: ${match.score.toFixed(3)}`);
    });
    
    // Return best match above similarity threshold
    const bestMatch = searchResults.matches[0];
    if (bestMatch.score >= cache.similarityThreshold) {
      console.log(`[SEMANTIC] Using match above threshold (${cache.similarityThreshold}): ${bestMatch.score.toFixed(3)}`);
      return {
        cacheKey: bestMatch.metadata.cacheKey,
        similarity: bestMatch.score,
        bucket: bucket,
        bestSimilarity: bestMatch.score
      };
    }
    
    console.log(`[SEMANTIC] Best similarity ${bestMatch.score.toFixed(3)} below threshold ${cache.similarityThreshold} - no match used`);
    return { bestSimilarity: bestMatch.score };
    
  } catch (error) {
    console.error('[SEMANTIC] Error finding similar image:', error);
    return { bestSimilarity: null, error: error.message }; // Graceful fallback to exact cache
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
    const seed = params.seed; // Extract seed parameter
    const bucket = getResolutionBucket(width, height, seed);
    
    // Store in Vectorize with indexed metadata for fast filtering
    // Use a hash of the cache key as ID since Vectorize has 64-byte limit
    const vectorizeId = await createSimpleHash(cacheKey);
    
    await cache.vectorize.upsert([{
      id: vectorizeId,
      values: embedding,
      metadata: {
        cacheKey: cacheKey,
        bucket: bucket,
        model: params.model || 'flux',
        seed: seed, // Store seed as separate indexed field
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

/**
 * Check semantic cache and return response if found
 * High-level function that handles the complete semantic cache workflow
 * @param {Object} cache - Semantic cache instance
 * @param {string} prompt - Image prompt
 * @param {Object} params - Request parameters
 * @returns {Promise<Object|null>} - Object with response and debug info, or null if miss
 */
export async function checkSemanticCacheAndRespond(cache, prompt, params = {}) {
  // Skip if no prompt provided
  if (!prompt || typeof prompt !== 'string') {
    console.log('[SEMANTIC] No valid prompt for semantic search');
    return null;
  }

  try {
    console.log('[SEMANTIC] Checking semantic cache for similar images...');
    const result = await findSimilarImage(cache, prompt, params);
    
    if (!result || !result.cacheKey) {
      console.log('[SEMANTIC] No semantic matches found');
      return { response: null, debugInfo: { searchPerformed: true, bestSimilarity: result?.bestSimilarity, error: result?.error } };
    }

    console.log(`[SEMANTIC] Found semantic match: ${result.cacheKey} (similarity: ${result.similarity.toFixed(3)})`);
    
    // Try to get the semantically similar image from R2
    const similarCachedImage = await cache.r2.get(result.cacheKey);
    
    if (!similarCachedImage) {
      console.log(`[SEMANTIC] Semantic match found but R2 object ${result.cacheKey} no longer exists`);
      return { response: null, debugInfo: { searchPerformed: true, bestSimilarity: result.similarity, error: 'R2 object not found' } };
    }

    // Create response with semantic cache headers
    const semanticHeaders = new Headers();
    setHttpMetadataHeaders(semanticHeaders, similarCachedImage.httpMetadata);
    
    // Set semantic cache headers
    semanticHeaders.set('cache-control', 'public, max-age=31536000, immutable');
    semanticHeaders.set('x-cache', 'HIT');
    semanticHeaders.set('x-cache-type', 'semantic');
    semanticHeaders.set('x-semantic-similarity', result.similarity.toFixed(3));
    semanticHeaders.set('x-semantic-bucket', result.bucket);
    semanticHeaders.set('access-control-allow-origin', '*');
    semanticHeaders.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    semanticHeaders.set('access-control-allow-headers', 'Content-Type');
    
    const response = new Response(similarCachedImage.body, {
      headers: semanticHeaders
    });
    
    return { 
      response, 
      debugInfo: { 
        searchPerformed: true, 
        bestSimilarity: result.similarity, 
        cacheHit: true 
      } 
    };
    
  } catch (error) {
    console.error('[SEMANTIC] Error checking semantic cache:', error);
    return { response: null, debugInfo: { searchPerformed: false, error: error.message } };
  }
}

/**
 * Check exact cache and return response if found
 * @param {Object} r2Bucket - R2 bucket instance
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Response|null>} - Exact cache response or null if miss
 */
export async function checkExactCacheAndRespond(r2Bucket, cacheKey) {
  try {
    const cachedImage = await r2Bucket.get(cacheKey);
    
    if (!cachedImage) {
      return null;
    }

    // Create response with exact cache headers
    const cachedHeaders = new Headers();
    setHttpMetadataHeaders(cachedHeaders, cachedImage.httpMetadata);
    
    // Set exact cache headers
    cachedHeaders.set('cache-control', 'public, max-age=31536000, immutable');
    cachedHeaders.set('x-cache', 'HIT');
    cachedHeaders.set('x-cache-type', 'exact');
    cachedHeaders.set('access-control-allow-origin', '*');
    cachedHeaders.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    cachedHeaders.set('access-control-allow-headers', 'Content-Type');
    
    return new Response(cachedImage.body, {
      headers: cachedHeaders
    });
    
  } catch (error) {
    console.error('Error retrieving cached image:', error);
    return null;
  }
}
