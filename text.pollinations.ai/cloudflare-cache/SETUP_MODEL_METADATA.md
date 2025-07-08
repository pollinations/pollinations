# Model-Specific Semantic Caching Setup

This document explains how to set up model-specific semantic caching using Cloudflare Vectorize metadata filtering.

## Overview

The semantic cache now isolates cache buckets by model type, ensuring that each AI model (OpenAI, GPT-4, Claude, etc.) has its own dedicated cache space. This prevents cross-model cache collisions and improves cache accuracy.

## Required Setup

### 1. Create Metadata Index for Model Field

You need to create a metadata index on the `model` field in your Vectorize index to enable efficient filtering:

```bash
# Create metadata index for the model field
npx wrangler vectorize create-metadata-index pollinations-text-cache-v1 --property-name=model --type=string
```

### 2. Verify Metadata Index

Check that the metadata index was created successfully:

```bash
# List metadata indexes
npx wrangler vectorize list-metadata-indexes pollinations-text-cache-v1
```

## How It Works

### 1. Model Extraction
- The system extracts the model name from the request body (`model`, `engine`, or `model_name` fields)
- Falls back to `'unknown'` if no model is found

### 2. Semantic Cache Storage
- When storing embeddings, the model name is included as metadata:
```javascript
{
  id: cacheKey,
  values: embedding,
  metadata: {
    model: modelName,
    cached_at: new Date().toISOString()
  }
}
```

### 3. Semantic Cache Lookup
- When searching for similar text, results are filtered by model:
```javascript
const searchResults = await vectorize.query(embedding, {
  topK: 1,
  filter: { model: modelName },
  returnMetadata: 'all'
});
```

## Benefits

1. **Cache Isolation**: Each model has its own semantic cache space
2. **Improved Accuracy**: No cross-model cache pollution
3. **Better Performance**: More relevant semantic matches within model boundaries
4. **Debug Headers**: New `x-cache-model` header shows which model's cache was used

## Debug Headers

The system now includes these debug headers:
- `x-cache-type`: `exact`, `semantic`, or `miss`
- `x-semantic-similarity`: Similarity score for semantic matches (0-1)
- `x-cache-model`: Model name for the cached response

## Testing

Test with different models to verify isolation:

```bash
# Test with OpenAI model
curl -X POST https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "What is machine learning?"}]}'

# Test with Claude model  
curl -X POST https://text.pollinations.ai/claude \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-sonnet", "messages": [{"role": "user", "content": "What is machine learning?"}]}'
```

The semantic cache should now only match within the same model type.

## Migration Notes

- Existing vectors without model metadata will not be found by the new filtered queries
- They will be gradually replaced as new requests come in
- No data loss occurs - old vectors remain in the index but become inactive
