/**
 * Manual OAuth Flow Test
 * 
 * This test guides you through testing the complete OAuth flow including
 * user interaction steps. Some parts require manual interaction.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fetch } from 'undici';

// Use a local server for testing
const BASE_URL = 'http://localhost:8787';

// Add timeout configuration - longer for manual interaction
const TEST_TIMEOUT = 120000; // 120 seconds to allow time for manual authorization

// Define types for API responses
interface SessionStatusResponse {
  status: string;
  user?: {
    id: string;
    login: string;
  };
  error?: string;
}

// Helper function to wait for a specified duration
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to poll for session status
async function pollSessionStatus(sessionId: string, maxAttempts = 30, interval = 2000): Promise<SessionStatusResponse> {
  console.log(`\nPolling for session status (sessionId: ${sessionId})...`);
  console.log('Please complete the authorization in your browser while polling occurs.');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Polling attempt ${attempt}/${maxAttempts}...`);
      
      const statusResp = await fetch(`${BASE_URL}/auth/status/${sessionId}`, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (statusResp.ok) {
        const statusData = await statusResp.json() as SessionStatusResponse;
        console.log(`Current status: ${statusData.status}`);
        
        if (statusData.status === 'completed') {
          console.log('Authentication completed successfully!');
          return statusData;
        }
      }
      
      // Wait before the next attempt
      await sleep(interval);
    } catch (error) {
      console.error(`Error polling session status: ${error}`);
    }
  }
  
  throw new Error(`Session status polling timed out after ${maxAttempts} attempts`);
}

describe('GitHub OAuth Flow Manual Test', () => {
  console.log(`Starting GitHub OAuth Flow Test against ${BASE_URL}`);
  
  // Check if server is running
  beforeAll(async () => {
    console.log('Checking if server is running...');
    try {
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
        console.warn('Make sure to start the server with: npm run dev');
      }
    } catch (error) {
      console.error('Error in beforeAll:', error);
    }
  });

  // Test the complete OAuth flow
  it('should complete the full OAuth flow with manual steps', async () => {
    console.log('\n=== TESTING COMPLETE OAUTH FLOW ===\n');
    
    try {
      // Step 1: Start the OAuth flow
      console.log('Step 1: Starting OAuth flow...');
      const startResp = await fetch(`${BASE_URL}/auth/start`, { 
        signal: AbortSignal.timeout(TEST_TIMEOUT)
      });
      
      expect(startResp.status).toBe(200);
      
      const startData = await startResp.json() as { sessionId: string; authUrl: string; requestId?: string };
      console.log('OAuth flow started successfully');
      console.log(`Session ID: ${startData.sessionId}`);
      console.log(`Auth URL: ${startData.authUrl}`);
      
      // Step 2: Manual user interaction
      console.log('\n=== MANUAL STEP REQUIRED ===');
      console.log('Please complete these steps:');
      console.log('1. Open the Auth URL in your browser');
      console.log('2. Authorize the GitHub App');
      console.log('3. You will be redirected to a callback URL');
      
      // Step 3: Poll for session status instead of waiting for manual confirmation
      console.log('\nStep 3: Polling for session status...');
      const sessionStatus = await pollSessionStatus(startData.sessionId);
      
      // Verify the session status
      expect(sessionStatus.status).toBe('completed');
      if (sessionStatus.user) {
        console.log(`\nAuthenticated as: ${sessionStatus.user.login}`);
        expect(sessionStatus.user).toHaveProperty('id');
        expect(sessionStatus.user).toHaveProperty('login');
      }
      
      console.log('\n✅ OAuth flow test completed successfully!');
      
    } catch (error) {
      console.error('Error in OAuth flow test:', error);
      throw error;
    }
  }, TEST_TIMEOUT);
});
