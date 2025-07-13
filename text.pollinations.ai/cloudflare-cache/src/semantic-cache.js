/**
 * Semantic Cache for Vectorize Text Caching
 * Based on GitHub issue #1402 and Cloudflare Vectorize V2 API
 * Uses metadata filtering and indexed properties for optimal performance
 */

import { createEmbeddingService, generateEmbedding, getModelBucket } from './embedding-service.js';
import { SEMANTIC_SIMILARITY_THRESHOLD, SEMANTIC_CACHE_ENABLED } from './config.js';

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
function setHttpMetadataHeaders(headers, metadata) {
  if (metadata) {
    // Iterate over all metadata and set headers
    for (const [key, value] of Object.entries(metadata)) {
      if (value) {
        // Convert camelCase to kebab-case for HTTP headers
        const headerName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        headers.set(headerName, value);
      }
    }
  } else {
    // Fallback to default content type
    headers.set('content-type', 'application/json');
  }
}

/**
 * Create a semantic cache instance
 * @param {Object} env - Environment bindings
 * @returns {Object} - Semantic cache instance
 */
export function createSemanticCache(env) {
  return {
    r2: env.TEXT_BUCKET,
    vectorize: env.TEXT_VECTORIZE_INDEX,
    ai: env.AI,
    similarityThreshold: SEMANTIC_SIMILARITY_THRESHOLD, // Centralized threshold configuration
    embeddingService: createEmbeddingService(env.AI)
  };
}

/**
 * Find similar text content in cache using Vectorize V2 metadata filtering
 * @param {Object} cache - Semantic cache instance
 * @param {string} text - Text content or prompt
 * @param {Object} params - Request parameters
 * @returns {Promise<Object|null>} - Similar text info or null
 */
export async function findSimilarText(cache, text, params = {}) {
  try {
    console.log(`[SEMANTIC] Searching for similar text: "${text.substring(0, 50)}..."`);
    
    // Generate embedding for the text
    const embeddingStart = Date.now();
    const embedding = await generateEmbedding(cache.embeddingService, text, params);
    const embeddingDuration = Date.now() - embeddingStart;
    
    console.log(`[SEMANTIC] Embedding generation completed in ${embeddingDuration}ms`);
    
    // Get model bucket for filtering
    const model = params.model || 'default';
    const bucket = getModelBucket(model, params);
    
    console.log(`[SEMANTIC] Searching in model bucket: ${bucket}`);
    
    // Search Vectorize with metadata filtering for efficiency
    const queryStart = Date.now();
    const searchResults = await cache.vectorize.query(embedding, {
      topK: 1,
      returnValues: false,
      returnMetadata: 'indexed', // Use indexed metadata for better performance (requires cacheKey index)
      filter: {
        bucket: { $eq: bucket }
        // Only filter by bucket - it already includes all necessary isolation (model, temperature, etc.)
      }
    });
    const queryDuration = Date.now() - queryStart;
    
    console.log(`[SEMANTIC] Vectorize query completed in ${queryDuration}ms`);
    console.log(`[SEMANTIC] Search results:`, {
      matchCount: searchResults.matches?.length || 0,
      queryDurationMs: queryDuration,
      searchQuery: { bucket }
    });
    
    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log('[SEMANTIC] No similar text found in cache');
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
    console.error('[SEMANTIC] Error finding similar text:', error);
    return { bestSimilarity: null, error: error.message }; // Graceful fallback to exact cache
  }
}

/**
 * Cache text embedding in Vectorize asynchronously
 * @param {Object} cache - Semantic cache instance
 * @param {string} cacheKey - R2 cache key
 * @param {string} text - Text content or prompt
 * @param {Object} params - Request parameters
 */
export async function cacheTextEmbedding(cache, cacheKey, text, params = {}) {
  try {
    console.log(`[SEMANTIC] Caching embedding for: ${cacheKey}`);
    
    // Generate embedding for the text
    const embeddingStart = Date.now();
    const embedding = await generateEmbedding(cache.embeddingService, text, params);
    const embeddingDuration = Date.now() - embeddingStart;
    
    console.log(`[SEMANTIC] Embedding generation completed in ${embeddingDuration}ms`);
    
    // Get bucket and vectorize ID
    const model = params.model || 'default';
    const bucket = getModelBucket(model, params);
    const vectorId = await createSimpleHash(cacheKey);
    
    console.log(`[SEMANTIC] Upserting to Vectorize - ID: ${vectorId}, Bucket: ${bucket}`);
    
    // Upsert to Vectorize with metadata
    const upsertStart = Date.now();
    const upsertResult = await cache.vectorize.upsert([{
      id: vectorId,
      values: embedding,
      metadata: {
        cacheKey: cacheKey,
        bucket: bucket,
        model: model,
        temperature: params.temperature ? params.temperature.toString() : null,
        max_tokens: params.max_tokens ? params.max_tokens.toString() : null,
        top_p: params.top_p ? params.top_p.toString() : null,
        cachedAt: Date.now().toString()
      }
    }]);
    const upsertDuration = Date.now() - upsertStart;
    
    console.log(`[SEMANTIC] Vectorize upsert completed in ${upsertDuration}ms`);
    console.log(`[SEMANTIC] Vectorize upsert result:`, JSON.stringify(upsertResult, null, 2));
    console.log(`[SEMANTIC] Successfully cached embedding in bucket: ${bucket}, mutation ID: ${upsertResult?.mutationId || 'unknown'}`);
    
  } catch (error) {
    console.error('[SEMANTIC] Error caching embedding:', error);
    console.error('[SEMANTIC] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    // Don't throw - this is asynchronous and shouldn't break the request
  }
}

/**
 * Check semantic cache and return response if found
 * High-level function that handles the complete semantic cache workflow
 * @param {Object} cache - Semantic cache instance
 * @param {string} text - Text content or prompt
 * @param {Object} params - Request parameters
 * @returns {Promise<Object|null>} - Object with response and debug info, or null if miss
 */
export async function checkSemanticCacheAndRespond(cache, text, params = {}) {
  // Skip if no text provided
  if (!text || typeof text !== 'string') {
    console.log('[SEMANTIC] No valid text for semantic search');
    return null;
  }

  try {
    console.log('[SEMANTIC] Checking semantic cache for similar text...');
    const result = await findSimilarText(cache, text, params);
    
    if (!result || !result.cacheKey) {
      console.log('[SEMANTIC] No semantic matches found');
      return { response: null, debugInfo: { searchPerformed: true, bestSimilarity: result?.bestSimilarity, error: result?.error } };
    }

    console.log(`[SEMANTIC] Found semantic match: ${result.cacheKey} (similarity: ${result.similarity.toFixed(3)})`);
    
    // Try to get the semantically similar text from R2
    const similarCachedText = await cache.r2.get(result.cacheKey);
    
    if (!similarCachedText) {
      console.log(`[SEMANTIC] Semantic match found but R2 object ${result.cacheKey} no longer exists`);
      return { response: null, debugInfo: { searchPerformed: true, bestSimilarity: result.similarity, error: 'R2 object not found' } };
    }

    // Create response with semantic cache headers
    const semanticHeaders = new Headers();
    
    // Set metadata headers if available
    if (similarCachedText.customMetadata) {
      setHttpMetadataHeaders(semanticHeaders, similarCachedText.customMetadata);
    }
    
    // Set semantic cache headers
    semanticHeaders.set('cache-control', 'public, max-age=31536000, immutable');
    semanticHeaders.set('x-cache', 'HIT');
    semanticHeaders.set('x-cache-type', 'semantic');
    semanticHeaders.set('x-semantic-similarity', result.similarity.toFixed(3));
    semanticHeaders.set('x-semantic-bucket', result.bucket);
    semanticHeaders.set('access-control-allow-origin', '*');
    semanticHeaders.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    semanticHeaders.set('access-control-allow-headers', 'Content-Type');
    
    const response = new Response(similarCachedText.body, {
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