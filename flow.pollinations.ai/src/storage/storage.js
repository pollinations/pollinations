import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default storage schema
const DEFAULT_STORAGE = {
  users: {}
};

/**
 * Storage class for handling user data, tokens, and referrers
 */
class Storage {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '../../data/user_storage.json');
    this.data = DEFAULT_STORAGE;
    this.initialized = false;
  }

  /**
   * Initialize the storage by loading data from the file
   */
  async initialize() {
    try {
      await fs.access(this.storagePath);
      const data = await fs.readFile(this.storagePath, 'utf-8');
      this.data = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it with default storage
        await this.saveData();
      } else {
        console.error('Error initializing storage:', error);
        throw error;
      }
    }
    this.initialized = true;
  }

  /**
   * Save the current data to the file
   */
  async saveData() {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving storage data:', error);
      throw error;
    }
  }

  /**
   * Create or update a user record
   * @param {string} githubId - GitHub user ID
   * @param {object} userData - User data to store
   */
  async setUser(githubId, userData) {
    const userId = `github:${githubId}`;
    
    // If user exists, merge data, otherwise create new user
    if (this.data.users[userId]) {
      this.data.users[userId] = {
        ...this.data.users[userId],
        ...userData,
        last_used: new Date().toISOString()
      };
    } else {
      this.data.users[userId] = {
        ...userData,
        pollinations_token: userData.pollinations_token || `poll_${uuidv4().replace(/-/g, '')}`,
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        referrers: userData.referrers || ["text.pollinations.ai", "image.pollinations.ai"]
      };
    }
    
    await this.saveData();
    return this.data.users[userId];
  }

  /**
   * Get a user by GitHub ID
   * @param {string} githubId - GitHub user ID
   */
  getUser(githubId) {
    const userId = `github:${githubId}`;
    return this.data.users[userId] || null;
  }

  /**
   * Get a user by Pollinations token
   * @param {string} token - Pollinations token
   */
  getUserByToken(token) {
    return Object.values(this.data.users).find(user => user.pollinations_token === token) || null;
  }

  /**
   * Add a referrer to a user's whitelist
   * @param {string} githubId - GitHub user ID
   * @param {string} referrer - Referrer domain to add
   */
  async addReferrer(githubId, referrer) {
    const userId = `github:${githubId}`;
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.referrers) {
      user.referrers = [];
    }
    
    // Don't add duplicates
    if (!user.referrers.includes(referrer)) {
      user.referrers.push(referrer);
      await this.saveData();
    }
    
    return user.referrers;
  }

  /**
   * Remove a referrer from a user's whitelist
   * @param {string} githubId - GitHub user ID
   * @param {string} referrer - Referrer domain to remove
   */
  async removeReferrer(githubId, referrer) {
    const userId = `github:${githubId}`;
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.referrers) {
      user.referrers = [];
      return user.referrers;
    }
    
    user.referrers = user.referrers.filter(r => r !== referrer);
    await this.saveData();
    
    return user.referrers;
  }

  /**
   * Check if a referrer is in a user's whitelist
   * @param {string} githubId - GitHub user ID
   * @param {string} referrer - Referrer domain to check
   */
  isReferrerAuthorized(githubId, referrer) {
    const userId = `github:${githubId}`;
    const user = this.data.users[userId];
    
    if (!user || !user.referrers) {
      return false;
    }
    
    return user.referrers.includes(referrer);
  }

  /**
   * Regenerate a user's Pollinations token
   * @param {string} githubId - GitHub user ID
   */
  async regenerateToken(githubId) {
    const userId = `github:${githubId}`;
    const user = this.data.users[userId];
    
    if (!user) {
      throw new Error('User not found');
    }
    
    user.pollinations_token = `poll_${uuidv4().replace(/-/g, '')}`;
    user.last_used = new Date().toISOString();
    
    await this.saveData();
    
    return user.pollinations_token;
  }
}

/**
 * Initialize the storage module
 * @param {string} storagePath - Path to the storage file
 */
export async function initializeStorage(storagePath) {
  const storage = new Storage(storagePath || process.env.STORAGE_PATH);
  await storage.initialize();
  return storage;
}

export default Storage;
