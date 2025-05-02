/**
 * Pollinations Authentication Service
 *
 * Functions and schemas for authenticating with auth.pollinations.ai
 * and managing domain allowlists
 */

import { createMCPResponse, createTextContent } from '../utils/coreUtils.js';
import { z } from 'zod';

// Constants
const AUTH_API_BASE_URL = 'https://auth.pollinations.ai';

/**
 * Initiates the GitHub OAuth authentication flow
 *
 * @returns {Promise<Object>} - MCP response object with session ID and auth URL
 */
async function startAuth() {
  try {
    // Call the auth.pollinations.ai start endpoint
    const response = await fetch(`${AUTH_API_BASE_URL}/start`);

    if (!response.ok) {
      throw new Error(`Failed to start authentication: ${response.statusText}`);
    }

    // Get the session ID and auth URL
    const authData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent(authData, true)
    ]);
  } catch (error) {
    console.error('Error starting authentication:', error);
    throw error;
  }
}

/**
 * Checks the status of an authentication session
 *
 * @param {Object} params - The parameters for checking auth status
 * @param {string} params.sessionId - The session ID to check
 * @returns {Promise<Object>} - MCP response object with the auth status
 */
async function checkAuthStatus(params) {
  const { sessionId } = params;

  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID is required and must be a string');
  }

  try {
    // Call the auth.pollinations.ai status endpoint
    const response = await fetch(`${AUTH_API_BASE_URL}/status/${sessionId}`);

    if (!response.ok) {
      throw new Error(`Failed to check authentication status: ${response.statusText}`);
    }

    // Get the status data
    const statusData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent(statusData, true)
    ]);
  } catch (error) {
    console.error('Error checking authentication status:', error);
    throw error;
  }
}

/**
 * Gets the domains allowlisted for a user
 *
 * @param {Object} params - The parameters for getting domains
 * @param {string} params.userId - The GitHub user ID
 * @param {string} params.sessionId - The session ID for authentication
 * @returns {Promise<Object>} - MCP response object with the allowlisted domains
 */
async function getDomains(params) {
  const { userId, sessionId } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required and must be a string');
  }

  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID is required and must be a string');
  }

  try {
    // Call the auth.pollinations.ai domains endpoint
    const response = await fetch(`${AUTH_API_BASE_URL}/api/user/${userId}/domains`, {
      headers: {
        'x-session-id': sessionId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get domains: ${response.statusText}`);
    }

    // Get the domains data
    const domainsData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent(domainsData, true)
    ]);
  } catch (error) {
    console.error('Error getting domains:', error);
    throw error;
  }
}

/**
 * Updates the domains allowlisted for a user
 *
 * @param {Object} params - The parameters for updating domains
 * @param {string} params.userId - The GitHub user ID
 * @param {string[]} params.domains - The domains to allowlist
 * @param {string} params.sessionId - The session ID for authentication
 * @returns {Promise<Object>} - MCP response object with the updated domains
 */
async function updateDomains(params) {
  const { userId, domains, sessionId } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required and must be a string');
  }

  if (!Array.isArray(domains)) {
    throw new Error('Domains must be an array of strings');
  }

  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID is required and must be a string');
  }

  try {
    // Call the auth.pollinations.ai domains endpoint
    const response = await fetch(`${AUTH_API_BASE_URL}/api/user/${userId}/domains`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ domains })
    });

    if (!response.ok) {
      throw new Error(`Failed to update domains: ${response.statusText}`);
    }

    // Get the updated domains data
    const updatedData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent(updatedData, true)
    ]);
  } catch (error) {
    console.error('Error updating domains:', error);
    throw error;
  }
}


const genZInstructions = `
When interacting with the Pollinations MCP server, use **vibey** Gen-Z language with lots of emojis! 
🔥 Make your responses **pop** with creative markdown formatting like _italics_, **bold**, and ~~strikethrough~~. 
Keep it short and sweet, use abbreviations (fr, ngl, iykyk), and throw in fun symbols like ✨💯🙌. 
No cap, this makes the whole experience way more engaging and aesthetic! #vibes`;

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const authTools = [
  [
    'startAuth',
    'Start GitHub OAuth authentication flow to log in to Pollinations. Show the returned link prominently to the user making it inviting to click it.'+genZInstructions,
    {},
    startAuth
  ],
  
  [
    'checkAuthStatus',
    'Check the status of an authentication session.'+genZInstructions,
    {
      sessionId: z.string().describe('The session ID to check')
    },
    checkAuthStatus
  ],
  
  [
    'getDomains',
    'Get domains allowlisted for a user.'+genZInstructions,
    {
      userId: z.string().describe('The GitHub user ID'),
      sessionId: z.string().describe('The session ID for authentication')
    },
    getDomains
  ],
  
  [
    'updateDomains',
    'Update domains allowlisted for a user',
    {
      userId: z.string().describe('The GitHub user ID'),
      domains: z.array(z.string()).describe('The domains to allowlist'),
      sessionId: z.string().describe('The session ID for authentication')
    },
    updateDomains
  ]
];
