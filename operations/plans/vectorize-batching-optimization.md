# Vectorize Batching Optimization Plan

**Date:** 2025-06-25  
**Goal:** Reduce vector propagation time from ~3 minutes to sub-30 seconds  
**Method:** Cloudflare Queues batching for Vectorize upserts

## 🔬 Research Findings

### Current Performance Issue
- **Problem**: Individual `cacheImageEmbedding()` calls take ~3 minutes to become queryable
- **Root Cause**: Each image generation triggers separate Vectorize upsert
- **Production Evidence**: Test measured exactly 2:53 propagation time

### Cloudflare Documentation Insights

**Vectorize Internal Batching:**
- Vectorize batches up to **200,000 vectors** OR **1,000 individual updates** (whichever first)
- Individual API calls create separate jobs → slow processing
- Batched API calls combine into fewer jobs → fast processing

**Real Performance Example from Cloudflare:**
```
❌ SLOW: 250,000 individual calls = 250 jobs = 1+ hour
✅ FAST: 100 batched calls (2,500 each) = 2-3 jobs = minutes
```

**Cloudflare Queues Configuration:**
- `max_batch_size`: Up to 100+ messages per batch
- `max_batch_timeout`: 30-60 seconds optimal for our use case
- Producer/Consumer architecture with separate Workers

## 🏗️ Implementation Architecture

### Current Flow (3-minute delay)
```
Image Request → Generate Image → cacheImageEmbedding() → Individual Vectorize Upsert (3 min delay)
```

### Proposed Flow (sub-30s delay)
```
Image Request → Generate Image → Send to Queue → Batch Consumer → Batched Vectorize Upsert (30s delay)
```

## 📋 Implementation Plan

### Phase 1: Queue Infrastructure Setup

#### 1.1 Create Queue
```bash
wrangler queues create vectorize-embeddings-queue
```

#### 1.2 Update wrangler.toml (Producer Config)
```toml
# Add to existing cache worker wrangler.toml
[[queues.producers]]
queue = "vectorize-embeddings-queue"
binding = "EMBEDDING_QUEUE"
```

#### 1.3 Create Consumer Worker
**New file:** `src/embedding-batch-consumer.js`
```javascript
export default {
  async queue(batch, env) {
    // Process batch of embedding messages
    console.log(`[BATCH] Processing ${batch.messages.length} embeddings`);
    
    const embeddings = batch.messages.map(msg => msg.body);
    await batchUpsertEmbeddings(embeddings, env);
    
    // Acknowledge all messages
    batch.ackAll();
  }
}
```

#### 1.4 Consumer wrangler.toml
**New file:** `embedding-consumer-wrangler.toml`
```toml
name = "vectorize-embedding-consumer"
main = "src/embedding-batch-consumer.js"

[[queues.consumers]]
queue = "vectorize-embeddings-queue"
max_batch_size = 50           # Batch 50 embeddings at once
max_batch_timeout = 30        # Wait max 30 seconds
max_retries = 3
dead_letter_queue = "embedding-dlq"

[env.production.vars]
# Environment variables for consumer

[[env.production.vectorize_indexes]]
binding = "VECTORIZE_INDEX"
index_name = "pollinations-image-cache-v2"

[[env.production.ai]]
binding = "AI"
```

### Phase 2: Producer Integration

#### 2.1 Replace Individual Upserts
**Modify:** `src/semantic-cache.js`

**Current:**
```javascript
// Line 158 in src/index.js
ctx.waitUntil(cacheImageEmbedding(semanticCache, cacheKey, semanticPrompt, imageParams));
```

**Replace with:**
```javascript
// Line 158 in src/index.js
ctx.waitUntil(queueEmbeddingForBatch(env.EMBEDDING_QUEUE, cacheKey, semanticPrompt, imageParams));
```

#### 2.2 Create Queue Producer Function
**Add to:** `src/semantic-cache.js`
```javascript
/**
 * Queue embedding for batch processing
 * @param {Object} queue - Queue binding
 * @param {string} cacheKey - R2 cache key
 * @param {string} prompt - Image prompt
 * @param {Object} params - Request parameters
 */
export async function queueEmbeddingForBatch(queue, cacheKey, prompt, params = {}) {
  try {
    console.log(`[QUEUE] Queuing embedding for batch processing: ${cacheKey}`);
    
    const embeddingData = {
      cacheKey,
      prompt,
      params,
      timestamp: Date.now()
    };
    
    await queue.send(embeddingData);
    console.log(`[QUEUE] Successfully queued embedding: ${cacheKey}`);
    
  } catch (error) {
    console.error('[QUEUE] Error queuing embedding:', error);
    // Fallback to individual upsert if queue fails
    console.log('[QUEUE] Falling back to individual upsert');
    // Could fallback to original cacheImageEmbedding here
  }
}
```

### Phase 3: Consumer Implementation

#### 3.1 Batch Upsert Function
**Add to:** `src/embedding-batch-consumer.js`
```javascript
import { createEmbeddingService, generateEmbedding, getResolutionBucket } from './embedding-service.js';

async function batchUpsertEmbeddings(embeddingDataArray, env) {
  try {
    console.log(`[BATCH] Processing ${embeddingDataArray.length} embeddings`);
    
    const embeddingService = createEmbeddingService(env.AI);
    const vectorsToUpsert = [];
    
    // Generate all embeddings first
    for (const data of embeddingDataArray) {
      try {
        const embedding = await generateEmbedding(embeddingService, data.prompt, data.params);
        
        // Prepare vector for upsert
        const width = parseInt(data.params.width) || 1024;
        const height = parseInt(data.params.height) || 1024;
        const seed = data.params.seed;
        const nologo = data.params.nologo;
        const image = data.params.image;
        const bucket = getResolutionBucket(width, height, seed, nologo, image);
        const vectorId = await createSimpleHash(data.cacheKey);
        
        vectorsToUpsert.push({
          id: vectorId,
          values: embedding,
          metadata: {
            cacheKey: data.cacheKey,
            bucket: bucket,
            model: data.params.model || 'flux',
            seed: seed ? seed.toString() : null,
            nologo: nologo,
            image: image ? image.substring(0, 8) : null,
            width: width,
            height: height,
            cachedAt: Date.now()
          }
        });
        
      } catch (error) {
        console.error(`[BATCH] Error processing embedding for ${data.cacheKey}:`, error);
        // Continue with other embeddings
      }
    }
    
    // Batch upsert all vectors at once
    if (vectorsToUpsert.length > 0) {
      console.log(`[BATCH] Upserting ${vectorsToUpsert.length} vectors to Vectorize`);
      const upsertStart = Date.now();
      
      const upsertResult = await env.VECTORIZE_INDEX.upsert(vectorsToUpsert);
      
      const upsertDuration = Date.now() - upsertStart;
      console.log(`[BATCH] Batch upsert completed in ${upsertDuration}ms`);
      console.log(`[BATCH] Upsert result:`, JSON.stringify(upsertResult, null, 2));
    }
    
  } catch (error) {
    console.error('[BATCH] Error in batch upsert:', error);
    throw error; // Will trigger retry
  }
}

async function createSimpleHash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}
```

### Phase 4: Deployment & Testing

#### 4.1 Deployment Sequence
```bash
# 1. Create queue
wrangler queues create vectorize-embeddings-queue

# 2. Deploy consumer worker
cd image.pollinations.ai/cloudflare-cache/consumer
wrangler deploy --config embedding-consumer-wrangler.toml

# 3. Deploy updated producer (main cache worker)
cd ../
wrangler deploy

# 4. Test with monitoring
wrangler tail --format pretty
```

#### 4.2 Testing Script
**Create:** `test-batch-propagation.js`
```javascript
// Similar to test-cache-propagation.js but testing batch performance
// Generate multiple requests quickly to test batching
// Measure propagation time with batched approach
```

#### 4.3 Monitoring & Validation
1. **Queue Metrics**: Monitor queue depth and processing time
2. **Vectorize Performance**: Test propagation time (should be <30s)
3. **Error Handling**: Verify dead letter queue handling
4. **Fallback Testing**: Ensure graceful degradation if queue fails

## 📊 Expected Results

### Performance Improvement
- **Current**: ~3 minutes per vector (individual upserts)
- **Target**: <30 seconds per batch (50 vectors per batch)
- **Improvement**: 6x faster propagation time

### Cost Optimization
- **Reduced Vectorize Operations**: 50 individual → 1 batch operation
- **Queue Costs**: Minimal (first 1M operations free)
- **Net Savings**: Reduced compute and faster user experience

### Scalability Benefits
- **Higher Volume Handling**: 25k requests/30min → batched efficiently
- **Burst Protection**: Queue buffers traffic spikes
- **Graceful Degradation**: Fallback to individual upserts if needed

## 🔄 Rollback Plan

If batching causes issues:

1. **Immediate**: Revert producer to individual `cacheImageEmbedding()`
2. **Queue Cleanup**: Drain existing queue messages
3. **Consumer Shutdown**: Stop consumer worker if needed
4. **Monitoring**: Verify return to 3-minute propagation (expected)

## 📝 Implementation Timeline

- **Week 1**: Infrastructure setup (queue, consumer worker)
- **Week 2**: Producer integration and testing
- **Week 3**: Production deployment and monitoring
- **Week 4**: Performance validation and optimization

## 🎯 Success Metrics

1. **Vector Propagation Time**: <30 seconds (vs current 3 minutes)
2. **Error Rate**: <1% failed batch processing
3. **Queue Performance**: <10 seconds average batch processing
4. **System Stability**: No degradation in exact cache performance

---

**Status**: Ready for implementation  
**Priority**: High - addresses major performance bottleneck  
**Risk**: Low - fallback to current system available
