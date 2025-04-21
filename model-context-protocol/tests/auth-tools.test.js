#!/usr/bin/env node

/**
 * Test script for authentication tools in the Pollinations MCP server
 * 
 * This script demonstrates how to use the authentication tools via MCP
 */

import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import fetch from 'node-fetch';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const SESSION_ID = process.env.SESSION_ID || 'github:12345678'; // Replace with a real GitHub ID
const TEST_REFERRER = 'test.pollinations.ai';

// Create MCP client with SSE transport
async function createClient() {
  const transport = new SSEClientTransport({
    sseUrl: `${SERVER_URL}/sse`,
    postUrl: `${SERVER_URL}/messages`,
    fetch
  });

  const client = new McpClient(transport);
  await client.connect();
  return client;
}

// Test authentication tools
async function testAuthTools() {
  console.log('Testing authentication tools...');
  
  try {
    const client = await createClient();
    console.log('Connected to MCP server');

    // Test 1: Check authentication status
    console.log('\n--- Test 1: Check authentication status ---');
    const authStatus = await client.runTool('isAuthenticated', {
      sessionId: SESSION_ID
    });
    console.log('Authentication status:', authStatus);

    // Test 2: Get authentication URL
    console.log('\n--- Test 2: Get authentication URL ---');
    const authUrl = await client.runTool('getAuthUrl', {
      returnUrl: 'https://pollinations.ai'
    });
    console.log('Authentication URL:', authUrl);

    // Test 3: Get token (requires authenticated session)
    console.log('\n--- Test 3: Get token ---');
    try {
      const tokenInfo = await client.runTool('getToken', {
        sessionId: SESSION_ID
      });
      console.log('Token info:', tokenInfo);
      
      // If we got a token, test verifying it
      if (tokenInfo && tokenInfo.token) {
        console.log('\n--- Test 4: Verify token ---');
        const verifyResult = await client.runTool('verifyToken', {
          token: tokenInfo.token
        });
        console.log('Token verification result:', verifyResult);
      }
    } catch (error) {
      console.log('Error getting token (session may not be authenticated):', error.message);
    }

    // Test 5: List referrers (requires authenticated session)
    console.log('\n--- Test 5: List referrers ---');
    try {
      const referrers = await client.runTool('listReferrers', {
        sessionId: SESSION_ID
      });
      console.log('Referrers:', referrers);
    } catch (error) {
      console.log('Error listing referrers (session may not be authenticated):', error.message);
    }

    // Test 6: Add referrer (requires authenticated session)
    console.log('\n--- Test 6: Add referrer ---');
    try {
      const addResult = await client.runTool('addReferrer', {
        sessionId: SESSION_ID,
        referrer: TEST_REFERRER
      });
      console.log('Add referrer result:', addResult);
    } catch (error) {
      console.log('Error adding referrer (session may not be authenticated):', error.message);
    }

    // Test 7: Remove referrer (requires authenticated session)
    console.log('\n--- Test 7: Remove referrer ---');
    try {
      const removeResult = await client.runTool('removeReferrer', {
        sessionId: SESSION_ID,
        referrer: TEST_REFERRER
      });
      console.log('Remove referrer result:', removeResult);
    } catch (error) {
      console.log('Error removing referrer (session may not be authenticated):', error.message);
    }

    await client.close();
    console.log('\nTests completed');
  } catch (error) {
    console.error('Error testing authentication tools:', error);
  }
}

// Run tests
testAuthTools().catch(console.error);
