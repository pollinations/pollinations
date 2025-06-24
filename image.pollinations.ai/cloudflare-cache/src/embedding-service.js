/**
 * Embedding Service for Vectorize Image Caching
 * Based on GitHub issue #2562 research and Cloudflare Vectorize V2 API
 * Uses BGE model with CLS pooling for improved accuracy
 */

/**
 * Create an embedding service instance
 * @param {Object} ai - Workers AI binding
 * @returns {Object} - Service instance
 */
export function createEmbeddingService(ai) {
  return {
    ai,
    model: "@cf/baai/bge-base-en-v1.5"
  };
}

/**
 * Generate embedding for a prompt using BGE model with CLS pooling
 * @param {Object} service - Embedding service instance
 * @param {string} prompt - The image prompt
 * @param {Object} params - Request parameters
 * @returns {Promise<Array>} - 768-dimensional embedding vector
 */
export async function generateEmbedding(service, prompt, params = {}) {
  try {
    // Normalize the prompt for consistent embeddings
    const normalizedText = normalizePromptForEmbedding(prompt, params);
    
    console.log(`[EMBEDDING] Generating embedding for: "${normalizedText.substring(0, 100)}..."`);
    
    // Generate embedding using Workers AI with CLS pooling for better accuracy
    const response = await service.ai.run(service.model, {
      text: normalizedText,
      pooling: 'cls' // Use CLS pooling for better accuracy on longer inputs
    });
    
    if (!response.data || !Array.isArray(response.data[0])) {
      throw new Error('Invalid embedding response format');
    }
    
    return response.data[0]; // 768-dimensional vector
  } catch (error) {
    console.error('[EMBEDDING] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Normalize prompt for consistent embeddings with semantic parameters
 * @param {string} prompt - Original prompt
 * @param {Object} params - Request parameters
 * @returns {string} - Normalized text for embedding
 */
export function normalizePromptForEmbedding(prompt, params = {}) {
  // Clean and normalize the prompt
  let normalized = prompt.toLowerCase().trim();
  
  // Add semantic parameters that affect image appearance
  const semanticParams = ['style', 'model', 'quality'];
  for (const key of semanticParams) {
    if (params[key]) {
      normalized += ` ${key}:${params[key]}`;
    }
  }
  
  return normalized;
}

/**
 * Create resolution bucket key with seed and nologo isolation
 * Different seeds should NOT match semantically as they produce different images
 * Images with/without logos are also visually different and shouldn't match
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string|number} seed - Image generation seed
 * @param {boolean|string} nologo - Whether logo should be excluded
 * @returns {string} - Resolution bucket key with seed and nologo isolation
 */
export function getResolutionBucket(width = 1024, height = 1024, seed = null, nologo = null) {
  const resolution = `${width}x${height}`;
  
  // Build bucket key with relevant visual parameters
  let bucket = resolution;
  
  // Include seed in bucket for proper isolation
  // Different seeds can produce significantly different images even with same prompt
  if (seed !== null && seed !== undefined) {
    bucket += `_seed${seed}`;
  }
  
  // Include nologo status since images with/without logos are visually different
  if (nologo !== null && nologo !== undefined) {
    const nologoValue = nologo === true || nologo === 'true' ? 'true' : 'false';
    bucket += `_nologo${nologoValue}`;
  }
  
  return bucket;
}
