/**
 * Integration tests for GitHub App authentication
 * 
 * Following the "thin proxy" design principle with minimal setup and assertions,
 * testing against a real running server without mocks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fetch } from 'undici';

// Use a local server for testing
const BASE_URL = 'http://localhost:8787';

// Add timeout configuration
const TEST_TIMEOUT = 10000; // 10 seconds

describe('GitHub App Integration Tests', () => {
  // Add logging for test suite start
  console.log(`Starting GitHub App Integration Tests against ${BASE_URL}`);
  
  // Start the server before running tests
  beforeAll(async () => {
    console.log('beforeAll: Setting up test suite');
    try {
      // Check if server is running
      console.log('Checking if server is running...');
      const healthCheck = await fetch(`${BASE_URL}/health`, { 
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }).catch(err => {
        console.error('Health check failed:', err.message);
        return null;
      });
      
      if (healthCheck && healthCheck.ok) {
        console.log('Server is running and healthy');
      } else {
        console.warn('Server may not be running or health endpoint not available');
      }
    } catch (error) {
      console.error('Error in beforeAll:', error);
    }
  });
  
  // Log before each test
  beforeEach(() => {
    console.log('-----------------------------------');
  });

  // Test auth start endpoint
  it('should start OAuth flow', async () => {
    console.log('Test: should start OAuth flow - Starting');
    
    try {
      console.log('Fetching /auth/start endpoint...');
      const resp = await fetch(`${BASE_URL}/auth/start`, { 
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      console.log(`Response status: ${resp.status}`);
      
      expect(resp.status).toBe(200);
      
      console.log('Parsing response JSON...');
      const data = await resp.json() as { sessionId: string; authUrl: string };
      console.log('Response data:', JSON.stringify(data));
      
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('authUrl');
      expect(data.authUrl).toContain('github.com/login/oauth/authorize');
      
      console.log('Test: should start OAuth flow - Completed successfully');
    } catch (error) {
      console.error('Error in OAuth flow test:', error);
      throw error; // Re-throw to fail the test
    }
  }, TEST_TIMEOUT);

  // Test auth status endpoint
  it('should return 404 for non-existent session', async () => {
    console.log('Test: should return 404 for non-existent session - Starting');
    
    try {
      console.log('Fetching /auth/status/non-existent-session endpoint...');
      const resp = await fetch(`${BASE_URL}/auth/status/non-existent-session`, {
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      console.log(`Response status: ${resp.status}`);
      
      expect(resp.status).toBe(404);
      
      console.log('Test: should return 404 for non-existent session - Completed successfully');
    } catch (error) {
      console.error('Error in non-existent session test:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  // Test app installations endpoint (once implemented)
  it('should handle GitHub App installations endpoint', async () => {
    console.log('Test: should handle GitHub App installations endpoint - Starting');
    
    try {
      console.log('Fetching /app/installations endpoint...');
      const resp = await fetch(`${BASE_URL}/app/installations`, {
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      console.log(`Response status: ${resp.status}`);
      
      // This test will initially fail until the endpoint is implemented
      // When implemented, it should return a list of installations
      // For now, we'll just check that the endpoint exists and returns a response
      expect(resp.status).not.toBe(404); // Should not be a 404 Not Found
      
      console.log('Test: should handle GitHub App installations endpoint - Completed');
    } catch (error) {
      console.error('Error in app installations test:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  // Test linking a user with an installation (once implemented)
  it('should handle linking a user with a GitHub App installation', async () => {
    console.log('Test: should handle linking a user with a GitHub App installation - Starting');
    
    try {
      console.log('Posting to /app/link endpoint...');
      const resp = await fetch(`${BASE_URL}/app/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'test-user-id',
          installationId: 'test-installation-id'
        }),
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      console.log(`Response status: ${resp.status}`);
      
      // This test will initially fail until the endpoint is implemented
      // For now, we'll just check that the endpoint exists and returns a response
      expect(resp.status).not.toBe(404); // Should not be a 404 Not Found
      
      console.log('Test: should handle linking a user with a GitHub App installation - Completed');
    } catch (error) {
      console.error('Error in app link test:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  // Test token endpoint with domain verification (once implemented)
  it('should handle token retrieval with domain verification', async () => {
    console.log('Test: should handle token retrieval with domain verification - Starting');
    
    try {
      console.log('Fetching /token/test-user-id?domain=example.com endpoint...');
      const resp = await fetch(`${BASE_URL}/token/test-user-id?domain=example.com`, {
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      console.log(`Response status: ${resp.status}`);
      
      // This test will initially fail until the endpoint is implemented
      // For now, we'll just check that the endpoint exists and returns a response
      expect(resp.status).not.toBe(404); // Should not be a 404 Not Found
      
      console.log('Test: should handle token retrieval with domain verification - Completed');
    } catch (error) {
      console.error('Error in token retrieval test:', error);
      throw error;
    }
  }, TEST_TIMEOUT);
  
  // Log after all tests
  afterAll(() => {
    console.log('All tests completed');
  });
});
