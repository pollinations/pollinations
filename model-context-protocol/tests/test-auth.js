#!/usr/bin/env node

/**
 * Test script for GitHub authentication
 *
 * This script tests the authentication service functions directly
 * without requiring an AI agent or MCP server.
 */

import {
  isAuthenticated,
  getToken,
  listReferrers,
  addReferrer,
  removeReferrer
} from './src/services/authService.js';

import readline from 'readline';
import open from 'open';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt user for input
const prompt = (question) => new Promise((resolve) => {
  rl.question(question, resolve);
});

// Main test function
async function runTests() {
  console.log('GitHub Authentication Test Script');
  console.log('================================\n');

  try {
    // Step 1: Get authentication URL
    console.log('Step 1: Getting GitHub authentication URL...');
    const authUrl = 'http://localhost:3000/github/login';
    console.log('Auth URL:', authUrl);

    // Step 2: Open browser for authentication
    const openBrowser = await prompt('\nOpen browser for authentication? (y/n): ');
    if (openBrowser.toLowerCase() === 'y') {
      console.log('Opening browser...');
      await open(authUrl);
    }

    // Step 3: Wait for user to complete authentication
    console.log('\nComplete the authentication in your browser.');
    console.log('After authentication, you will see a page with your Session ID');
    console.log('Copy the Session ID from that page.');

    const sessionId = await prompt('\nEnter your sessionId: ');

    // Step 4: Check authentication status
    console.log('\nStep 4: Checking authentication status...');
    const authStatus = await isAuthenticated(sessionId);
    console.log('Authentication status:', authStatus);

    if (!authStatus.authenticated) {
      console.log('Not authenticated. Exiting tests.');
      rl.close();
      return;
    }

    // Step 5: Get token
    console.log('\nStep 5: Getting token...');
    const tokenResult = await getToken(sessionId);
    console.log('Token:', tokenResult);

    // Step 6: List referrers
    console.log('\nStep 6: Listing referrers...');
    const referrers = await listReferrers(sessionId);
    console.log('Referrers:', referrers);

    // Step 7: Add a referrer
    const newReferrer = await prompt('\nEnter a domain to add to whitelist (e.g., example.com): ');
    console.log(`\nStep 7: Adding referrer ${newReferrer}...`);
    const addResult = await addReferrer(sessionId, newReferrer);
    console.log('Updated referrers:', addResult);

    // Step 8: Remove a referrer
    const removeChoice = await prompt('\nRemove the referrer you just added? (y/n): ');
    if (removeChoice.toLowerCase() === 'y') {
      console.log(`\nStep 8: Removing referrer ${newReferrer}...`);
      const removeResult = await removeReferrer(sessionId, newReferrer);
      console.log('Updated referrers:', removeResult);
    }

    console.log('\nTests completed successfully!');
  } catch (error) {
    console.error('Error during tests:', error);
  } finally {
    rl.close();
  }
}

// Run the tests
runTests();
