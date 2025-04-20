import fetch from 'node-fetch';
import crypto from 'crypto';
import debug from 'debug';

const log = debug('pollinations:github-service');
const errorLog = debug('pollinations:github-service:error');

/**
 * Check if the user has a valid GitHub authentication
 * @param {Object} params - Function parameters
 * @param {string} params.sessionId - Session ID to check
 * @returns {Promise<Object>} Authentication status
 */
export async function githubIsAuthenticated({ sessionId }) {
  try {
    if (!sessionId) {
      return { authenticated: false, error: 'Missing session ID' };
    }

    const response = await fetch(`https://text.pollinations.ai/github/status?sessionId=${sessionId}`);
    
    if (!response.ok) {
      return { authenticated: false, error: `Failed to check authentication status: ${response.statusText}` };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    errorLog('Error checking GitHub authentication status:', error);
    return { authenticated: false, error: `Failed to check authentication status: ${error.message}` };
  }
}

/**
 * Get a URL for GitHub authentication
 * @param {Object} params - Function parameters
 * @param {string} params.returnUrl - URL to return to after authentication
 * @returns {Promise<Object>} Authentication URL and session ID
 */
export async function githubGetAuthUrl({ returnUrl }) {
  try {
    const returnPath = returnUrl || '';
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Create auth URL with session ID and return URL
    const authUrl = `https://text.pollinations.ai/github/login?sessionId=${sessionId}&returnUrl=${encodeURIComponent(returnPath)}`;
    
    return {
      authUrl,
      sessionId,
      message: 'Please visit this URL to authenticate with GitHub'
    };
  } catch (error) {
    errorLog('Error generating GitHub auth URL:', error);
    return { error: `Failed to generate GitHub authentication URL: ${error.message}` };
  }
}

/**
 * Get a Pollinations token for a user
 * @param {Object} params - Function parameters
 * @param {string} params.sessionId - Session ID of the authenticated user
 * @returns {Promise<Object>} Token information
 */
export async function githubGetToken({ sessionId }) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Missing session ID' };
    }
    
    // First check if the user is authenticated
    const authStatus = await githubIsAuthenticated({ sessionId });
    
    if (!authStatus.authenticated) {
      return { success: false, error: 'User is not authenticated with GitHub' };
    }
    
    // Get the Pollinations token
    const response = await fetch(`https://text.pollinations.ai/github/token?sessionId=${sessionId}`);
    
    if (!response.ok) {
      return { success: false, error: `Failed to get Pollinations token: ${response.statusText}` };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      token: data.token,
      userId: data.userId
    };
  } catch (error) {
    errorLog('Error getting Pollinations token:', error);
    return { success: false, error: `Failed to get Pollinations token: ${error.message}` };
  }
}

/**
 * List authorized referrers for a user
 * @param {Object} params - Function parameters
 * @param {string} params.sessionId - Session ID of the authenticated user
 * @returns {Promise<Object>} List of referrers
 */
export async function githubListReferrers({ sessionId }) {
  try {
    if (!sessionId) {
      return { success: false, error: 'Missing session ID' };
    }
    
    // First check if the user is authenticated
    const authStatus = await githubIsAuthenticated({ sessionId });
    
    if (!authStatus.authenticated) {
      return { success: false, error: 'User is not authenticated with GitHub' };
    }
    
    // Get the referrers
    const response = await fetch(`https://text.pollinations.ai/github/referrers/list?sessionId=${sessionId}`);
    
    if (!response.ok) {
      return { success: false, error: `Failed to list referrers: ${response.statusText}` };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      referrers: data.referrers
    };
  } catch (error) {
    errorLog('Error listing referrers:', error);
    return { success: false, error: `Failed to list referrers: ${error.message}` };
  }
}

/**
 * Add a referrer to a user's whitelist
 * @param {Object} params - Function parameters
 * @param {string} params.sessionId - Session ID of the authenticated user
 * @param {string} params.referrer - Referrer to add to whitelist
 * @returns {Promise<Object>} Success status
 */
export async function githubAddReferrer({ sessionId, referrer }) {
  try {
    if (!sessionId || !referrer) {
      return { success: false, error: 'Missing required parameters' };
    }
    
    // First check if the user is authenticated
    const authStatus = await githubIsAuthenticated({ sessionId });
    
    if (!authStatus.authenticated) {
      return { success: false, error: 'User is not authenticated with GitHub' };
    }
    
    // Add the referrer
    const response = await fetch(`https://text.pollinations.ai/github/referrers/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        referrer
      })
    });
    
    if (!response.ok) {
      return { success: false, error: `Failed to add referrer: ${response.statusText}` };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      message: data.message || 'Referrer added successfully'
    };
  } catch (error) {
    errorLog('Error adding referrer:', error);
    return { success: false, error: `Failed to add referrer: ${error.message}` };
  }
}

/**
 * Remove a referrer from a user's whitelist
 * @param {Object} params - Function parameters
 * @param {string} params.sessionId - Session ID of the authenticated user
 * @param {string} params.referrer - Referrer to remove from whitelist
 * @returns {Promise<Object>} Success status
 */
export async function githubRemoveReferrer({ sessionId, referrer }) {
  try {
    if (!sessionId || !referrer) {
      return { success: false, error: 'Missing required parameters' };
    }
    
    // First check if the user is authenticated
    const authStatus = await githubIsAuthenticated({ sessionId });
    
    if (!authStatus.authenticated) {
      return { success: false, error: 'User is not authenticated with GitHub' };
    }
    
    // Remove the referrer
    const response = await fetch(`https://text.pollinations.ai/github/referrers/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        referrer
      })
    });
    
    if (!response.ok) {
      return { success: false, error: `Failed to remove referrer: ${response.statusText}` };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      message: data.message || 'Referrer removed successfully'
    };
  } catch (error) {
    errorLog('Error removing referrer:', error);
    return { success: false, error: `Failed to remove referrer: ${error.message}` };
  }
}

// Export all GitHub service functions
export default {
  githubIsAuthenticated,
  githubGetAuthUrl,
  githubGetToken,
  githubListReferrers,
  githubAddReferrer,
  githubRemoveReferrer
};
