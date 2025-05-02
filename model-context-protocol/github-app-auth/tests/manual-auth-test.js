#!/usr/bin/env node

/**
 * Manual authentication test script
 * 
 * This script helps diagnose issues with the manual authentication flow
 * by logging detailed information about each step.
 */

import fetch from 'node-fetch';
import { createInterface } from 'readline';

// Create readline interface for CLI interaction
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const AUTH_API_BASE_URL = 'https://auth.pollinations.ai';

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

// Main function
async function main() {
  console.log('\n🔍 Manual Authentication Test');
  console.log('============================\n');
  
  // Step 1: Get session ID
  console.log('Step 1: Getting a new session ID from /start endpoint...');
  try {
    const startResponse = await fetch(`${AUTH_API_BASE_URL}/start`);
    const startData = await startResponse.json();
    
    console.log('\n✅ Got response from /start:');
    console.log(JSON.stringify(startData, null, 2));
    
    const sessionId = startData.sessionId;
    const authUrl = startData.authUrl;
    
    console.log(`\n📋 Session ID: ${sessionId}`);
    console.log(`🔗 Auth URL: ${authUrl}`);
    
    // Step 2: Ask user to complete authentication
    console.log('\nStep 2: Please complete the authentication by:');
    console.log('1. Opening the Auth URL in your browser');
    console.log('2. Completing the GitHub authentication process');
    console.log('3. Waiting for the "Authentication Complete" message\n');
    
    await askQuestion('Press Enter after you see "Authentication Complete" in the browser...');
    
    // Step 3: Check status
    console.log('\nStep 3: Checking authentication status...');
    
    // Check status multiple times to see if it changes
    for (let i = 0; i < 5; i++) {
      console.log(`\nCheck #${i+1} for session ID: ${sessionId}`);
      
      const statusResponse = await fetch(`${AUTH_API_BASE_URL}/status/${sessionId}`);
      const statusData = await statusResponse.json();
      
      console.log('Status response:');
      console.log(JSON.stringify(statusData, null, 2));
      
      // Wait a bit before checking again
      if (i < 4) {
        console.log('\nWaiting 2 seconds before checking again...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Step 4: Ask for manual session ID check
    console.log('\nStep 4: Manual session ID check');
    const manualSessionId = await askQuestion('\nEnter a session ID to check (or press Enter to skip): ');
    
    if (manualSessionId) {
      console.log(`Checking status for manually entered session ID: ${manualSessionId}`);
      
      const manualStatusResponse = await fetch(`${AUTH_API_BASE_URL}/status/${manualSessionId}`);
      const manualStatusData = await manualStatusResponse.json();
      
      console.log('Status response:');
      console.log(JSON.stringify(manualStatusData, null, 2));
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  }
  
  console.log('\n🏁 Test completed');
  rl.close();
}

// Start the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
