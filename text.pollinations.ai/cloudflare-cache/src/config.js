// Semantic cache configuration
export const SEMANTIC_CACHE_ENABLED = true;
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.82; // Similarity threshold for a cache hit

// Embedding model configuration
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";

// BGE-M3 model configuration
export const BGE_POOLING = "cls"; // Use 'cls' for better performance on longer inputs
export const EMBEDDING_DIMENSIONS = 1024; // BGE-M3 uses 1024 dimensions

// Weighted semantic embeddings configuration
export const SEMANTIC_WEIGHTING_ENABLED = true; // Enable weighted embeddings for recent context
export const RECENT_TURNS_COUNT = 2; // Number of recent conversation turns to emphasize
export const HISTORY_SEPARATOR = "\n\n[SEP]\n\n"; // Clear separator between full history and recent history
export const LATEST_EXCHANGE_START_TAG = "[LATEST_EXCHANGE]"; // Start tag for recent turns markup
export const LATEST_EXCHANGE_END_TAG = "[/LATEST_EXCHANGE]"; // End tag for recent turns markup
