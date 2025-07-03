/**
 * Embedding Service for Vectorize Text Caching
 * Based on GitHub issue #1402 and Cloudflare Vectorize V2 API
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
 * Generate embedding for text content using BGE model with CLS pooling
 * @param {Object} service - Embedding service instance
 * @param {string} text - The text content
 * @param {Object} params - Request parameters
 * @returns {Promise<Array>} - 768-dimensional embedding vector
 */
export async function generateEmbedding(service, text, params = {}) {
  try {
    // Normalize the text for consistent embeddings
    const normalizedText = normalizeTextForEmbedding(text, params);
    
    console.log(`[EMBEDDING] Generating embedding for text: "${normalizedText.substring(0, 100)}..."`);
    
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
 * Normalize text for consistent embeddings
 * @param {string} text - Original text
 * @param {Object} params - Request parameters
 * @returns {string} - Normalized text for embedding
 */
export function normalizeTextForEmbedding(text, params = {}) {
  // Clean and normalize the text
  let normalized = text.trim();
  
  // Truncate very long text to first 8000 characters
  // This ensures we stay within model context limits while preserving key content
  if (normalized.length > 8000) {
    normalized = normalized.substring(0, 8000);
  }
  
  return normalized;
}

/**
 * Create model bucket key for proper isolation
 * Different models should be in different buckets as they produce different outputs
 * @param {string} model - LLM model name
 * @param {Object} params - Additional parameters that affect output
 * @returns {string} - Model bucket key
 */
export function getModelBucket(model = 'default', params = {}) {
  // Start with the model name
  let bucket = model.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Add temperature if specified (rounded to 1 decimal place)
  if (params.temperature !== undefined) {
    const temp = Math.round(parseFloat(params.temperature) * 10) / 10;
    bucket += `_temp${temp}`;
  }
  
  // Add max_tokens if specified
  if (params.max_tokens !== undefined) {
    bucket += `_max${params.max_tokens}`;
  }
  
  // Add top_p if specified (rounded to 2 decimal places)
  if (params.top_p !== undefined) {
    const topP = Math.round(parseFloat(params.top_p) * 100) / 100;
    bucket += `_top${topP}`;
  }
  
  // Add presence_penalty if specified
  if (params.presence_penalty !== undefined) {
    bucket += `_pres${params.presence_penalty}`;
  }
  
  // Add frequency_penalty if specified
  if (params.frequency_penalty !== undefined) {
    bucket += `_freq${params.frequency_penalty}`;
  }
  
  return bucket;
}