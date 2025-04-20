/**
 * GitHub Authentication Service for Pollinations MCP
 * 
 * Implements GitHub OAuth authentication with dual methods:
 * 1. Referrer-based authentication
 * 2. Token-based authentication
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Storage constants
const STORAGE_DIR = path.join(os.homedir(), '.pollinations');
const STORAGE_FILE = path.join(STORAGE_DIR, 'auth.json');

// GitHub OAuth settings
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const DEFAULT_REDIRECT_URI = 'https://me.pollinations.ai/github/callback';

/**
 * Ensure storage directory exists
 */
async function ensureStorageExists() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating storage directory:', error);
    throw error;
  }
}

/**
 * Load user data from storage
 * @returns {Promise<Object>} The user data
 */
async function loadUserData() {
  try {
    await ensureStorageExists();
    
    try {
      const data = await fs.readFile(STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty data structure
        return { users: {} };
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    throw error;
  }
}

/**
 * Save user data to storage
 * @param {Object} data - The user data to save
 */
async function saveUserData(data) {
  try {
    await ensureStorageExists();
    await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

/**
 * Generate a new Pollinations access token
 * @returns {string} A new random token
 */
function generateToken() {
  return 'poll_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Check if a session is authenticated
 * 
 * @param {string} sessionId - The session ID to check
 * @returns {Promise<Object>} Authentication status
 */
export async function isAuthenticated(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    const userData = await loadUserData();
    const isAuth = !!userData.users[sessionId];
    
    return {
      authenticated: isAuth,
      sessionId,
      ...(isAuth ? {
        githubId: sessionId,
        lastUsed: userData.users[sessionId].last_used
      } : {})
    };
  } catch (error) {
    console.error('Error checking authentication:', error);
    throw error;
  }
}

/**
 * Get GitHub OAuth authentication URL
 * 
 * @param {Object} options - Options for authentication
 * @param {string} [options.returnUrl] - URL to redirect to after authentication
 * @returns {Promise<Object>} Authentication URL
 */
export async function getAuthUrl(options = {}) {
  if (!GITHUB_CLIENT_ID) {
    throw new Error('GITHUB_CLIENT_ID environment variable is not set');
  }

  const { returnUrl } = options;
  
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = encodeURIComponent(DEFAULT_REDIRECT_URI);
  
  // Store state and return URL temporarily
  const userData = await loadUserData();
  if (!userData.states) userData.states = {};
  
  userData.states[state] = {
    returnUrl: returnUrl || '',
    created_at: new Date().toISOString()
  };
  
  await saveUserData(userData);
  
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;
  
  return {
    authUrl,
    state
  };
}

/**
 * Complete GitHub OAuth authentication
 * 
 * @param {string} code - OAuth code from GitHub
 * @param {string} state - State parameter for verification
 * @returns {Promise<Object>} Authentication result
 */
export async function completeAuth(code, state) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth credentials are not set');
  }

  if (!code || !state) {
    throw new Error('Code and state parameters are required');
  }

  try {
    // Verify state
    const userData = await loadUserData();
    if (!userData.states || !userData.states[state]) {
      throw new Error('Invalid state parameter');
    }

    const { returnUrl } = userData.states[state];
    
    // Exchange code for token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: DEFAULT_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();
    const githubToken = tokenData.access_token;
    
    if (!githubToken) {
      throw new Error('No access token received from GitHub');
    }
    
    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user info from GitHub');
    }

    const userInfo = await userResponse.json();
    const githubId = `github:${userInfo.id}`;
    
    // Generate Pollinations token
    const pollinationsToken = generateToken();
    
    // Store user data
    userData.users[githubId] = {
      github_token: githubToken,
      pollinations_token: pollinationsToken,
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      user_info: {
        id: userInfo.id,
        login: userInfo.login,
        name: userInfo.name,
        avatar_url: userInfo.avatar_url
      },
      referrers: ['text.pollinations.ai', 'image.pollinations.ai']
    };
    
    // Clean up state
    delete userData.states[state];
    
    await saveUserData(userData);
    
    return {
      success: true,
      sessionId: githubId,
      pollinationsToken,
      returnUrl
    };
  } catch (error) {
    console.error('Error completing authentication:', error);
    throw error;
  }
}

/**
 * Get or generate a Pollinations access token for the authenticated user
 * 
 * @param {string} sessionId - The session ID of the authenticated user
 * @returns {Promise<Object>} Token information
 */
export async function getToken(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[sessionId];
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Update last used time
    user.last_used = new Date().toISOString();
    await saveUserData(userData);
    
    return {
      token: user.pollinations_token,
      created_at: user.created_at
    };
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
}

/**
 * Regenerate a new Pollinations access token
 * 
 * @param {string} sessionId - The session ID of the authenticated user
 * @returns {Promise<Object>} New token information
 */
export async function regenerateToken(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[sessionId];
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Generate new token
    const newToken = generateToken();
    user.pollinations_token = newToken;
    user.last_used = new Date().toISOString();
    
    await saveUserData(userData);
    
    return {
      token: newToken,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error regenerating token:', error);
    throw error;
  }
}

/**
 * List authorized referrers for a user
 * 
 * @param {string} sessionId - The session ID of the authenticated user
 * @returns {Promise<Object>} List of authorized referrers
 */
export async function listReferrers(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[sessionId];
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Update last used time
    user.last_used = new Date().toISOString();
    await saveUserData(userData);
    
    return {
      referrers: user.referrers || []
    };
  } catch (error) {
    console.error('Error listing referrers:', error);
    throw error;
  }
}

/**
 * Add a referrer to a user's whitelist
 * 
 * @param {string} sessionId - The session ID of the authenticated user
 * @param {string} referrer - The domain to add to the whitelist
 * @returns {Promise<Object>} Updated list of authorized referrers
 */
export async function addReferrer(sessionId, referrer) {
  if (!sessionId || !referrer) {
    throw new Error('Session ID and referrer are required');
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[sessionId];
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Ensure the referrers array exists
    if (!user.referrers) {
      user.referrers = [];
    }
    
    // Only add if not already in the list
    if (!user.referrers.includes(referrer)) {
      user.referrers.push(referrer);
    }
    
    // Update last used time
    user.last_used = new Date().toISOString();
    await saveUserData(userData);
    
    return {
      referrers: user.referrers
    };
  } catch (error) {
    console.error('Error adding referrer:', error);
    throw error;
  }
}

/**
 * Remove a referrer from a user's whitelist
 * 
 * @param {string} sessionId - The session ID of the authenticated user
 * @param {string} referrer - The domain to remove from the whitelist
 * @returns {Promise<Object>} Updated list of authorized referrers
 */
export async function removeReferrer(sessionId, referrer) {
  if (!sessionId || !referrer) {
    throw new Error('Session ID and referrer are required');
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[sessionId];
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Ensure the referrers array exists
    if (!user.referrers) {
      user.referrers = [];
    }
    
    // Remove the referrer
    user.referrers = user.referrers.filter(r => r !== referrer);
    
    // Update last used time
    user.last_used = new Date().toISOString();
    await saveUserData(userData);
    
    return {
      referrers: user.referrers
    };
  } catch (error) {
    console.error('Error removing referrer:', error);
    throw error;
  }
}

/**
 * Verify a Pollinations token for API access
 * 
 * @param {string} token - The token to verify
 * @returns {Promise<Object>} Verification result
 */
export async function verifyToken(token) {
  if (!token) {
    return { valid: false };
  }

  try {
    const userData = await loadUserData();
    
    // Find user with matching token
    const user = Object.entries(userData.users).find(
      ([_, data]) => data.pollinations_token === token
    );
    
    if (!user) {
      return { valid: false };
    }
    
    const [userId, userInfo] = user;
    
    // Update last used time
    userInfo.last_used = new Date().toISOString();
    await saveUserData(userData);
    
    return {
      valid: true,
      userId,
      created_at: userInfo.created_at
    };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Verify if a referrer is authorized for a user
 * 
 * @param {string} userId - The user ID
 * @param {string} referrer - The referrer to check
 * @returns {Promise<Object>} Verification result
 */
export async function verifyReferrer(userId, referrer) {
  if (!userId || !referrer) {
    return { valid: false };
  }

  try {
    const userData = await loadUserData();
    const user = userData.users[userId];
    
    if (!user || !user.referrers) {
      return { valid: false };
    }
    
    const isValid = user.referrers.some(r => {
      // Allow for wildcard subdomains
      if (r.startsWith('*.')) {
        const domain = r.substring(2);
        return referrer.endsWith(domain);
      }
      return r === referrer;
    });
    
    if (isValid) {
      // Update last used time
      user.last_used = new Date().toISOString();
      await saveUserData(userData);
    }
    
    return { valid: isValid };
  } catch (error) {
    console.error('Error verifying referrer:', error);
    return { valid: false, error: error.message };
  }
}
