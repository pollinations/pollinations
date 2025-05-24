/**
 * Pollinations Authentication Service
 *
 * Functions and schemas for authenticating with auth.pollinations.ai
 * and managing domain allowlists using JWT-based authentication
 */

import { createMCPResponse, createTextContent } from '../utils/coreUtils.js';
import { z } from 'zod';
import crypto from 'crypto';

// Constants
const AUTH_API_BASE_URL = 'https://auth.pollinations.ai';

/**
 * Initiates the GitHub OAuth authentication flow with PKCE
 *
 * @returns {Promise<Object>} - MCP response object with auth URL and PKCE values
 */
async function startAuth() {
  try {
    // Generate PKCE values
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    // Generate state for security
    const state = crypto.randomBytes(16).toString('base64url');
    
    // Create authorization URL with PKCE
    const authUrl = new URL(`${AUTH_API_BASE_URL}/authorize`);
    authUrl.searchParams.set('client_id', 'pollinations-mcp');
    authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'openid profile email');

    // Return the response in MCP format with PKCE values for later use
    return createMCPResponse([
      createTextContent({
        authUrl: authUrl.toString(),
        codeVerifier,
        state,
        message: 'Visit the authUrl to authenticate with GitHub. Save the codeVerifier and state for token exchange.'
      }, true)
    ]);
  } catch (error) {
    console.error('Error starting authentication:', error);
    throw error;
  }
}

/**
 * Exchanges authorization code for access token
 *
 * @param {Object} params - The parameters for token exchange
 * @param {string} params.code - The authorization code from callback
 * @param {string} params.codeVerifier - The PKCE code verifier
 * @returns {Promise<Object>} - MCP response object with access and refresh tokens
 */
async function exchangeToken(params) {
  const { code, codeVerifier } = params;

  if (!code || typeof code !== 'string') {
    throw new Error('Authorization code is required and must be a string');
  }

  if (!codeVerifier || typeof codeVerifier !== 'string') {
    throw new Error('Code verifier is required and must be a string');
  }

  try {
    // Exchange code for token
    const response = await fetch(`${AUTH_API_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: 'pollinations-mcp',
        redirect_uri: 'http://localhost:3000/callback'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange token: ${error}`);
    }

    // Get the tokens
    const tokenData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        message: 'Authentication successful! Use the access token for API requests.'
      }, true)
    ]);
  } catch (error) {
    console.error('Error exchanging token:', error);
    throw error;
  }
}

/**
 * Gets the domains allowlisted for a user using JWT authentication
 *
 * @param {Object} params - The parameters for getting domains
 * @param {string} params.userId - The GitHub user ID
 * @param {string} params.accessToken - The JWT access token
 * @returns {Promise<Object>} - MCP response object with the allowlisted domains
 */
async function getDomains(params) {
  const { userId, accessToken } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required and must be a string');
  }

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Access token is required and must be a string');
  }

  try {
    // Call the auth.pollinations.ai domains endpoint with JWT
    const response = await fetch(`${AUTH_API_BASE_URL}/api/user/${userId}/domains`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
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
 * Updates the domains allowlisted for a user using JWT authentication
 *
 * @param {Object} params - The parameters for updating domains
 * @param {string} params.userId - The GitHub user ID
 * @param {string[]} params.domains - The domains to allowlist
 * @param {string} params.accessToken - The JWT access token
 * @returns {Promise<Object>} - MCP response object with the updated domains
 */
async function updateDomains(params) {
  const { userId, domains, accessToken } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required and must be a string');
  }

  if (!Array.isArray(domains)) {
    throw new Error('Domains must be an array of strings');
  }

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Access token is required and must be a string');
  }

  try {
    // Call the auth.pollinations.ai domains endpoint with JWT
    const response = await fetch(`${AUTH_API_BASE_URL}/api/user/${userId}/domains`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
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

/**
 * Refreshes an expired access token
 *
 * @param {Object} params - The parameters for refreshing token
 * @param {string} params.refreshToken - The refresh token
 * @returns {Promise<Object>} - MCP response object with new access token
 */
async function refreshToken(params) {
  const { refreshToken } = params;

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('Refresh token is required and must be a string');
  }

  try {
    // Refresh the token
    const response = await fetch(`${AUTH_API_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'pollinations-mcp'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    // Get the new tokens
    const tokenData = await response.json();

    // Return the response in MCP format
    return createMCPResponse([
      createTextContent({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        message: 'Token refreshed successfully!'
      }, true)
    ]);
  } catch (error) {
    console.error('Error refreshing token:', error);
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
    'Start GitHub OAuth authentication flow with PKCE to log in to Pollinations. Show the returned authUrl prominently to the user. Save the codeVerifier and state for token exchange.'+genZInstructions,
    {},
    startAuth
  ],
  
  [
    'exchangeToken',
    'Exchange authorization code for access token after user completes GitHub authentication. Requires the code from callback URL and the codeVerifier from startAuth.'+genZInstructions,
    {
      code: z.string().describe('The authorization code from the callback URL'),
      codeVerifier: z.string().describe('The PKCE code verifier from startAuth')
    },
    exchangeToken
  ],
  
  [
    'refreshToken',
    'Refresh an expired access token using the refresh token.'+genZInstructions,
    {
      refreshToken: z.string().describe('The refresh token received from exchangeToken or previous refresh')
    },
    refreshToken
  ],
  
  [
    'getDomains',
    'Get domains allowlisted for a user using JWT authentication.'+genZInstructions,
    {
      userId: z.string().describe('The GitHub user ID'),
      accessToken: z.string().describe('The JWT access token from exchangeToken')
    },
    getDomains
  ],
  
  [
    'updateDomains',
    'Update domains allowlisted for a user using JWT authentication',
    {
      userId: z.string().describe('The GitHub user ID'),
      domains: z.array(z.string()).describe('The domains to allowlist'),
      accessToken: z.string().describe('The JWT access token from exchangeToken')
    },
    updateDomains
  ]
];
