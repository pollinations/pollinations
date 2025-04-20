import crypto from 'crypto';
import fetch from 'node-fetch';
import debug from 'debug';
import { storeGithubToken } from './tokenStorage.js';

const log = debug('pollinations:github-auth');
const errorLog = debug('pollinations:github-auth:error');

// Session storage (in-memory for simplicity)
// In production, consider using Redis or another persistent store
const sessions = new Map();

// GitHub OAuth configuration
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'https://text.pollinations.ai/github/callback';

/**
 * Create a new session
 * @returns {Object} Session info with ID and state
 */
export function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const state = crypto.randomBytes(16).toString('hex');
  
  sessions.set(sessionId, {
    state,
    createdAt: new Date().toISOString()
  });
  
  return { sessionId, state };
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object} Session data
 */
export function getSession(sessionId) {
  return sessions.get(sessionId);
}

/**
 * Update a session
 * @param {string} sessionId - Session ID
 * @param {Object} data - Data to update
 */
export function updateSession(sessionId, data) {
  const session = sessions.get(sessionId);
  if (session) {
    sessions.set(sessionId, { ...session, ...data });
  }
}

/**
 * Generate the GitHub OAuth URL
 * @param {string} sessionId - Session ID
 * @param {string} state - CSRF state token
 * @returns {string} GitHub authorization URL
 */
export function getGithubAuthUrl(sessionId, state) {
  if (!CLIENT_ID) {
    throw new Error('GitHub OAuth is not configured (missing CLIENT_ID)');
  }
  
  const scopes = [
    'repo',       // Access to repositories
    'user:email', // Access to user email
  ].join(' ');
  
  return `https://github.com/login/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}` +
    `&sessionId=${sessionId}`;
}

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from GitHub
 * @returns {Promise<string>} GitHub access token
 */
export async function exchangeCodeForToken(code) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('GitHub OAuth is not configured (missing CLIENT_ID or CLIENT_SECRET)');
  }
  
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }
  
  return data.access_token;
}

/**
 * Get user info from GitHub API
 * @param {string} token - GitHub access token
 * @returns {Promise<Object>} GitHub user data
 */
export async function getGithubUserInfo(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pollinations-GitHub-Integration'
    }
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Store GitHub token for a user
 * @param {Object} githubUser - GitHub user info
 * @param {string} token - GitHub access token
 * @returns {Promise<Object>} Storage result with Pollinations token
 */
export async function authenticateUser(githubUser, token) {
  const userId = `github:${githubUser.id}`;
  
  // Store GitHub token and generate Pollinations token
  const result = await storeGithubToken(userId, token);
  
  if (!result.success) {
    throw new Error(`Failed to store GitHub token: ${result.error}`);
  }
  
  log(`GitHub user authenticated: ${githubUser.login} (${userId})`);
  
  return {
    userId,
    login: githubUser.login,
    pollinations_token: result.pollinations_token
  };
}

/**
 * Check if a GitHub token is valid
 * @param {string} token - GitHub token to check
 * @returns {Promise<boolean>} Token validity
 */
export async function isGithubTokenValid(token) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pollinations-GitHub-Integration'
      }
    });
    
    return response.ok;
  } catch (error) {
    errorLog('Error checking GitHub token:', error);
    return false;
  }
}
