/**
 * Text Service API Integration Tests
 * 
 * These tests verify the external API behavior of the text service.
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startService, assertSuccessfulJsonResponse, assertErrorResponse, randomString } from '../../../shared/testing/index.js';

describe('Text Service API Integration Tests', () => {
  let api;
  let stopService;
  
  beforeAll(async () => {
    // Start the text service
    try {
      const service = await startService({
        command: 'node startServer.js',
        cwd: './text.pollinations.ai',
        port: 12000,
        readyPattern: 'Server started',
        timeout: 30000
      });
      
      api = service.request;
      stopService = service.stop;
    } catch (error) {
      console.error('Failed to start text service:', error);
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
  
  it('should generate text from a prompt', async () => {
    const prompt = 'What is the capital of France?';
    const response = await api.get(`/${encodeURIComponent(prompt)}`);
    
    expect(response.status).toBe(200);
    expect(typeof response.text).toBe('string');
    expect(response.text.length).toBeGreaterThan(0);
  });
  
  it('should handle POST requests with messages', async () => {
    const response = await api.post('/').send({
      messages: [{ role: 'user', content: 'Hello, how are you?' }]
    });
    
    expect(response.status).toBe(200);
    expect(typeof response.text).toBe('string');
    expect(response.text.length).toBeGreaterThan(0);
  });
  
  it('should support OpenAI-compatible endpoint', async () => {
    const response = await api.post('/openai/chat/completions').send({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'openai'
    });
    
    assertSuccessfulJsonResponse(response, expect);
    expect(response.body.choices).toBeDefined();
    expect(Array.isArray(response.body.choices)).toBe(true);
    expect(response.body.choices[0].message).toBeDefined();
    expect(response.body.choices[0].message.content).toBeDefined();
  });
});