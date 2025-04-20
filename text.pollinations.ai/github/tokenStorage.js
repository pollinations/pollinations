import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import debug from 'debug';

const log = debug('pollinations:github-token-storage');
const errorLog = debug('pollinations:github-token-storage:error');

// File to store tokens and referrers
const STORAGE_FILE = path.join(process.cwd(), 'github_tokens.json');

/**
 * Initialize the token storage file if it doesn't exist
 */
export async function initStorage() {
  try {
    await fs.access(STORAGE_FILE);
    log('GitHub token storage file exists');
  } catch (error) {
    log('Creating GitHub token storage file');
    await fs.writeFile(STORAGE_FILE, JSON.stringify({ users: {} }), 'utf8');
  }
}

/**
 * Load data from the storage file
 */
export async function loadStorage() {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    errorLog('Error loading token storage:', error);
    return { users: {} };
  }
}

/**
 * Save data to the storage file
 */
export async function saveStorage(data) {
  try {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    errorLog('Error saving token storage:', error);
    throw new Error(`Failed to save token storage: ${error.message}`);
  }
}

/**
 * Store a GitHub token for a user
 * @param {string} userId - GitHub user ID
 * @param {string} githubToken - GitHub access token
 * @returns {Promise<Object>} Storage result
 */
export async function storeGithubToken(userId, githubToken) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      storage.users[userId] = {
        github_token: githubToken,
        pollinations_token: generatePollinationsToken(),
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        referrers: ['text.pollinations.ai', 'image.pollinations.ai']
      };
    } else {
      storage.users[userId].github_token = githubToken;
      storage.users[userId].last_used = new Date().toISOString();
    }
    
    await saveStorage(storage);
    
    return { 
      success: true, 
      pollinations_token: storage.users[userId].pollinations_token 
    };
  } catch (error) {
    errorLog('Error storing GitHub token:', error);
    return { success: false, error: `Failed to store GitHub token: ${error.message}` };
  }
}

/**
 * Generate a unique Pollinations token
 */
function generatePollinationsToken() {
  return `poll_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Regenerate a Pollinations token for a user
 * @param {string} userId - GitHub user ID
 * @returns {Promise<Object>} New token
 */
export async function regeneratePollinationsToken(userId) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      return { success: false, error: 'User not found' };
    }
    
    storage.users[userId].pollinations_token = generatePollinationsToken();
    storage.users[userId].last_used = new Date().toISOString();
    
    await saveStorage(storage);
    
    return { 
      success: true, 
      pollinations_token: storage.users[userId].pollinations_token 
    };
  } catch (error) {
    errorLog('Error regenerating Pollinations token:', error);
    return { success: false, error: `Failed to regenerate token: ${error.message}` };
  }
}

/**
 * Get user data by GitHub ID
 * @param {string} userId - GitHub user ID
 * @returns {Promise<Object>} User data
 */
export async function getUserById(userId) {
  try {
    const storage = await loadStorage();
    const userData = storage.users[userId];
    
    if (!userData) {
      return { success: false, error: 'User not found' };
    }
    
    return { success: true, user: userData };
  } catch (error) {
    errorLog('Error getting user data:', error);
    return { success: false, error: `Failed to get user data: ${error.message}` };
  }
}

/**
 * Get user data by Pollinations token
 * @param {string} token - Pollinations token
 * @returns {Promise<Object>} User data
 */
export async function getUserByToken(token) {
  try {
    const storage = await loadStorage();
    
    // Find user with matching token
    const userId = Object.keys(storage.users).find(
      id => storage.users[id].pollinations_token === token
    );
    
    if (!userId) {
      return { success: false, error: 'Invalid token' };
    }
    
    // Update last used timestamp
    storage.users[userId].last_used = new Date().toISOString();
    await saveStorage(storage);
    
    return { 
      success: true, 
      userId,
      githubToken: storage.users[userId].github_token
    };
  } catch (error) {
    errorLog('Error getting user by token:', error);
    return { success: false, error: `Failed to get user by token: ${error.message}` };
  }
}

/**
 * Check if a referrer is whitelisted for a user
 * @param {string} userId - GitHub user ID
 * @param {string} referrer - Referrer to check
 * @returns {Promise<Object>} Validation result
 */
export async function isReferrerWhitelisted(userId, referrer) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      return { allowed: false, error: 'User not found' };
    }
    
    const isWhitelisted = storage.users[userId].referrers.includes(referrer);
    
    return { allowed: isWhitelisted };
  } catch (error) {
    errorLog('Error checking referrer whitelist:', error);
    return { allowed: false, error: `Failed to check referrer whitelist: ${error.message}` };
  }
}

/**
 * List referrers for a user
 * @param {string} userId - GitHub user ID
 * @returns {Promise<Object>} List of referrers
 */
export async function listReferrers(userId) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      return { success: false, error: 'User not found' };
    }
    
    return { 
      success: true, 
      referrers: storage.users[userId].referrers 
    };
  } catch (error) {
    errorLog('Error listing referrers:', error);
    return { success: false, error: `Failed to list referrers: ${error.message}` };
  }
}

/**
 * Add a referrer to a user's whitelist
 * @param {string} userId - GitHub user ID
 * @param {string} referrer - Referrer to add
 * @returns {Promise<Object>} Result
 */
export async function addReferrer(userId, referrer) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      return { success: false, error: 'User not found' };
    }
    
    // Check if referrer already exists
    if (storage.users[userId].referrers.includes(referrer)) {
      return { success: true, message: 'Referrer already whitelisted' };
    }
    
    // Add referrer
    storage.users[userId].referrers.push(referrer);
    await saveStorage(storage);
    
    return { success: true, message: 'Referrer added to whitelist' };
  } catch (error) {
    errorLog('Error adding referrer:', error);
    return { success: false, error: `Failed to add referrer: ${error.message}` };
  }
}

/**
 * Remove a referrer from a user's whitelist
 * @param {string} userId - GitHub user ID
 * @param {string} referrer - Referrer to remove
 * @returns {Promise<Object>} Result
 */
export async function removeReferrer(userId, referrer) {
  try {
    const storage = await loadStorage();
    
    if (!storage.users[userId]) {
      return { success: false, error: 'User not found' };
    }
    
    // Check if referrer exists
    const index = storage.users[userId].referrers.indexOf(referrer);
    if (index === -1) {
      return { success: true, message: 'Referrer not in whitelist' };
    }
    
    // Remove referrer
    storage.users[userId].referrers.splice(index, 1);
    await saveStorage(storage);
    
    return { success: true, message: 'Referrer removed from whitelist' };
  } catch (error) {
    errorLog('Error removing referrer:', error);
    return { success: false, error: `Failed to remove referrer: ${error.message}` };
  }
}

// Initialize storage on module import
initStorage().catch(error => {
  errorLog('Failed to initialize token storage:', error);
});
