import { createEmbeddingService, generateEmbedding } from './embedding-service.js';
import { SEMANTIC_SIMILARITY_THRESHOLD, SEMANTIC_CACHE_ENABLED } from './config.js';

// Create a semantic cache instance
export function createSemanticCache(env) {
  return {
    r2: env.TEXT_BUCKET,
    vectorize: env.VECTORIZE_INDEX,
    ai: env.AI,
    similarityThreshold: SEMANTIC_SIMILARITY_THRESHOLD,
    embeddingService: createEmbeddingService(env.AI)
  };
}

// Find similar text in cache for a specific model
export async function findSimilarText(cache, text, modelName = 'unknown') {
  if (!SEMANTIC_CACHE_ENABLED) return null;
  
  // Check if Vectorize is available (not available in local dev)
  if (!cache.vectorize) {
    console.log('[SEMANTIC_CACHE] Vectorize not available, skipping semantic search');
    return null;
  }

  try {
    const embedding = await generateEmbedding(cache.embeddingService, text);
    
    // Query with model-specific metadata filter
    const searchResults = await cache.vectorize.query(embedding, { 
      topK: 1,
      filter: { model: modelName },
      returnMetadata: 'all'
    });

    if (searchResults.matches.length === 0) {
      console.log(`[SEMANTIC_CACHE] No similar text found for model: ${modelName}`);
      return null;
    }

    const bestMatch = searchResults.matches[0];
    if (bestMatch.score >= cache.similarityThreshold) {
      console.log(`[SEMANTIC_CACHE] Found similar text for model ${modelName}: score=${bestMatch.score}`);
      return {
        cacheKey: bestMatch.id,
        similarity: bestMatch.score,
        model: bestMatch.metadata?.model || 'unknown',
        aboveThreshold: true
      };
    }

    console.log(`[SEMANTIC_CACHE] Similar text found but below threshold: ${bestMatch.score} < ${cache.similarityThreshold}`);
    return {
      cacheKey: null,
      similarity: bestMatch.score,
      model: bestMatch.metadata?.model || 'unknown',
      aboveThreshold: false
    };
  } catch (error) {
    console.error('[SEMANTIC_CACHE] Error finding similar text:', error);
    return null;
  }
}

// Cache text embedding asynchronously with model metadata
export async function cacheTextEmbedding(cache, cacheKey, text, modelName = 'unknown') {
  if (!SEMANTIC_CACHE_ENABLED) return;
  
  // Check if Vectorize is available (not available in local dev)
  if (!cache.vectorize) {
    console.log('[SEMANTIC_CACHE] Vectorize not available, skipping embedding cache');
    return;
  }

  try {
    const embedding = await generateEmbedding(cache.embeddingService, text);
    
    // Store vector with model metadata for filtering
    await cache.vectorize.upsert([{ 
      id: cacheKey, 
      values: embedding,
      metadata: { 
        model: modelName,
        cached_at: new Date().toISOString()
      }
    }]);
    
    console.log(`[SEMANTIC_CACHE] Cached embedding for key: ${cacheKey}, model: ${modelName}`);
  } catch (error) {
    console.error('[SEMANTIC_CACHE] Error caching text embedding:', error);
  }
}
