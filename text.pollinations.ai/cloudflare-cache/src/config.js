// Semantic cache configuration
export const SEMANTIC_CACHE_ENABLED = true;
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.93; // Similarity threshold for a cache hit

// Embedding model configuration
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";

// BGE-M3 model configuration
export const BGE_POOLING = "cls"; // Use 'cls' for better performance on longer inputs
export const EMBEDDING_DIMENSIONS = 1024; // BGE-M3 uses 1024 dimensions
