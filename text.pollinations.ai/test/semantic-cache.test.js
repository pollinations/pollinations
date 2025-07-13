/**
 * Test for semantic caching functionality
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createSemanticCache, findSimilarText, cacheTextEmbedding } from '../cloudflare-cache/src/semantic-cache.js';
import { createEmbeddingService, generateEmbedding } from '../cloudflare-cache/src/embedding-service.js';
import { SEMANTIC_SIMILARITY_THRESHOLD } from '../cloudflare-cache/src/config.js';

// Mock environment
const mockEnv = {
  TEXT_BUCKET: {
    get: jest.fn(),
    put: jest.fn()
  },
  TEXT_VECTORIZE_INDEX: {
    query: jest.fn(),
    upsert: jest.fn()
  },
  AI: {
    run: jest.fn()
  }
};

// Mock embedding
const mockEmbedding = Array(768).fill(0).map(() => Math.random());

describe('Semantic Cache', () => {
  beforeAll(() => {
    // Mock crypto.subtle.digest
    global.crypto = {
      subtle: {
        digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer)
      }
    };
    
    // Mock TextEncoder
    global.TextEncoder = class {
      encode() {
        return new Uint8Array(10);
      }
    };
    
    // Mock console.log to reduce noise
    console.log = jest.fn();
    console.error = jest.fn();
  });
  
  afterAll(() => {
    jest.restoreAllMocks();
  });
  
  it('should create a semantic cache instance', () => {
    const cache = createSemanticCache(mockEnv);
    
    expect(cache).toHaveProperty('r2', mockEnv.TEXT_BUCKET);
    expect(cache).toHaveProperty('vectorize', mockEnv.TEXT_VECTORIZE_INDEX);
    expect(cache).toHaveProperty('ai', mockEnv.AI);
    expect(cache).toHaveProperty('similarityThreshold', SEMANTIC_SIMILARITY_THRESHOLD);
    expect(cache).toHaveProperty('embeddingService');
  });
  
  it('should find similar text when above threshold', async () => {
    // Mock AI response
    mockEnv.AI.run.mockResolvedValue({
      data: [mockEmbedding]
    });
    
    // Mock Vectorize query response
    mockEnv.TEXT_VECTORIZE_INDEX.query.mockResolvedValue({
      matches: [
        {
          id: 'test-id',
          score: 0.95, // Above threshold
          metadata: {
            cacheKey: 'test-cache-key',
            bucket: 'test-model'
          }
        }
      ]
    });
    
    const cache = createSemanticCache(mockEnv);
    const result = await findSimilarText(cache, 'test prompt', { model: 'test-model' });
    
    expect(result).toHaveProperty('cacheKey', 'test-cache-key');
    expect(result).toHaveProperty('similarity', 0.95);
    expect(result).toHaveProperty('bucket', 'test-model');
  });
  
  it('should not find similar text when below threshold', async () => {
    // Mock AI response
    mockEnv.AI.run.mockResolvedValue({
      data: [mockEmbedding]
    });
    
    // Mock Vectorize query response
    mockEnv.TEXT_VECTORIZE_INDEX.query.mockResolvedValue({
      matches: [
        {
          id: 'test-id',
          score: 0.8, // Below threshold
          metadata: {
            cacheKey: 'test-cache-key',
            bucket: 'test-model'
          }
        }
      ]
    });
    
    const cache = createSemanticCache(mockEnv);
    const result = await findSimilarText(cache, 'test prompt', { model: 'test-model' });
    
    expect(result).not.toHaveProperty('cacheKey');
    expect(result).toHaveProperty('bestSimilarity', 0.8);
  });
  
  it('should cache text embedding', async () => {
    // Mock AI response
    mockEnv.AI.run.mockResolvedValue({
      data: [mockEmbedding]
    });
    
    // Mock Vectorize upsert response
    mockEnv.TEXT_VECTORIZE_INDEX.upsert.mockResolvedValue({
      mutationId: 'test-mutation-id'
    });
    
    const cache = createSemanticCache(mockEnv);
    await cacheTextEmbedding(cache, 'test-cache-key', 'test prompt', { model: 'test-model' });
    
    expect(mockEnv.TEXT_VECTORIZE_INDEX.upsert).toHaveBeenCalled();
    const upsertCall = mockEnv.TEXT_VECTORIZE_INDEX.upsert.mock.calls[0][0];
    
    expect(upsertCall[0]).toHaveProperty('id');
    expect(upsertCall[0]).toHaveProperty('values', mockEmbedding);
    expect(upsertCall[0]).toHaveProperty('metadata.cacheKey', 'test-cache-key');
    expect(upsertCall[0]).toHaveProperty('metadata.bucket');
    expect(upsertCall[0]).toHaveProperty('metadata.model', 'test-model');
  });
});