// Semantic cache configuration
export const SEMANTIC_CACHE_ENABLED = true;
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.93; // Similarity threshold for a cache hit

// Embedding model configuration
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

// BGE model requires specifying the pooling method
export const BGE_POOLING = "cls"; // Use 'cls' for better performance on longer inputs
