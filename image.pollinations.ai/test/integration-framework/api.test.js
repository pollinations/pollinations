/**
 * Image Service API Integration Tests
 * 
 * These tests verify the external API behavior of the image service.
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startService, assertSuccessfulImageResponse, assertSuccessfulJsonResponse, assertErrorResponse, retry } from '../../../shared/testing/index.js';

describe('Image Service API Integration Tests', () => {
  let api;
  let stopService;
  
  beforeAll(async () => {
    // Start the image service
    try {
      const service = await startService({
        command: 'node src/index.js',
        cwd: './image.pollinations.ai',
        port: 12001,
        readyPattern: 'Server started',
        timeout: 30000
      });
      
      api = service.request;
      stopService = service.stop;
    } catch (error) {
      console.error('Failed to start image service:', error);
      throw error;
    }
  }, 60000); // 60 second timeout for service startup
  
  afterAll(async () => {
    if (stopService) {
      await stopService();
    }
  });
  
  it('should return available models', async () => {
    const response = await api.get('/models');
    
    assertSuccessfulJsonResponse(response, expect);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });
  
  it('should generate an image from a prompt', async () => {
    const prompt = 'A beautiful sunset over the ocean';
    
    // First request starts the generation
    const initResponse = await api.get(`/prompt/${encodeURIComponent(prompt)}`);
    
    // If the API returns a 202 Accepted, we need to poll for the result
    if (initResponse.status === 202) {
      const requestId = initResponse.body.requestId;
      expect(requestId).toBeDefined();
      
      // Poll for the result
      const imageResponse = await retry(async () => {
        const pollResponse = await api.get(`/progress?requestId=${requestId}`);
        
        if (pollResponse.body.status === 'completed') {
          return api.get(`/result?requestId=${requestId}`);
        }
        
        throw new Error('Image not ready yet');
      }, { retries: 10, interval: 2000 });
      
      assertSuccessfulImageResponse(imageResponse, expect);
    } else {
      // If the API returns the image directly
      assertSuccessfulImageResponse(initResponse, expect);
    }
  }, 60000); // 60 second timeout for image generation
});