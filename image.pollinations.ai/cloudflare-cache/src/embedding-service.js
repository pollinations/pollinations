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
  // Clean and normalize the prompt - only use the pure prompt text
  // Model, style, and quality are handled through metadata filtering and bucketing
  let normalized = prompt.toLowerCase().trim();
  
  // Remove all punctuation for consistent embeddings
  // This ensures "test." and "test..." and "test" all produce the same embedding
  normalized = normalized.replace(/[^\w\s]/g, ' ');
  
  // Normalize whitespace (replace multiple spaces with single space)
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Create resolution bucket key with seed, nologo, and image isolation
 * Different seeds should NOT match semantically as they produce different images
 * Images with/without logos are also visually different and shouldn't match
 * Image-to-image vs text-only generation produce fundamentally different outputs
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string|number} seed - Image generation seed
 * @param {boolean|string} nologo - Whether logo should be excluded
 * @param {string} image - Base64 image for image-to-image generation
 * @returns {string} - Resolution bucket key with complete parameter isolation
 */
export function getResolutionBucket(width = 1024, height = 1024, seed = null, nologo = null, image = null) {
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
  
  // Include image parameter for image-to-image vs text-only isolation
  // Image-to-image generation produces fundamentally different outputs
  if (image !== null && image !== undefined && image !== '') {
    // Use a short hash of the image to avoid bucket name explosion
    // Different images should be in different buckets but same image should match
    bucket += `_img${image.substring(0, 8)}`;
  }
  
  return bucket;
}
