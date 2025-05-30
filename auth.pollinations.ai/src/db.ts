import type { User, UserTier } from './types';
import type { D1Database } from '@cloudflare/workers-types';

// Ultra-simplified user management - only store github_user_id and username
export async function upsertUser(db: D1Database, user: Partial<User> & { github_user_id: string }): Promise<User> {
  // Minimal query with only essential fields
  await db.prepare(`
    INSERT INTO users (github_user_id, username)
    VALUES (?, ?)
    ON CONFLICT(github_user_id) DO UPDATE SET
      username = excluded.username,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    user.github_user_id,
    user.username!
  ).run();
  
  return getUser(db, user.github_user_id) as Promise<User>;
}

export async function getUser(db: D1Database, userId: string): Promise<User | null> {
  const result = await db.prepare(`
    SELECT github_user_id, username FROM users WHERE github_user_id = ?
  `).bind(userId).first();
  
  if (!result) return null;
  
  // Return only the essential fields
  return {
    github_user_id: result.github_user_id as string,
    username: result.username as string
  } as User;
}

// Domain management functions
export async function updateDomainAllowlist(db: D1Database, userId: string, domains: string[]): Promise<void> {
  // First delete existing domains for this user
  await db.prepare(`
    DELETE FROM domains WHERE user_id = ?
  `).bind(userId).run();
  
  // Then insert new domains
  if (domains.length > 0) {
    // Create a prepared statement for domain insertion
    const stmt = db.prepare(`
      INSERT INTO domains (user_id, domain) VALUES (?, ?)
    `);
    
    // Insert each domain
    for (const domain of domains) {
      await stmt.bind(userId, domain).run();
    }
  }
  
  console.log(`Updated domains for user ${userId}: ${domains.join(', ')}`);
}

export async function getDomains(db: D1Database, userId: string): Promise<string[]> {
  console.log(`Getting domains for user ${userId}`);
  
  try {
    const results = await db.prepare(`
      SELECT domain FROM domains WHERE user_id = ?
    `).bind(userId).all();
    
    console.log('Domain query results:', JSON.stringify(results));
    
    return (results.results || []).map(row => row.domain as string);
  } catch (error) {
    console.error('Error getting domains:', error);
    return [];
  }
}

export async function isDomainAllowed(db: D1Database, userId: string, domain: string): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM domains WHERE user_id = ? AND domain = ?
  `).bind(userId, domain).first();
  
  return !!result;
}

// OAuth state management
export async function saveOAuthState(db: D1Database, state: string, redirectUri: string): Promise<void> {
  await db.prepare(`
    INSERT INTO oauth_state (state, redirect_uri) VALUES (?, ?)
  `).bind(state, redirectUri).run();
}

export async function getOAuthState(db: D1Database, state: string): Promise<{ redirect_uri: string } | null> {
  const result = await db.prepare(`
    SELECT redirect_uri FROM oauth_state WHERE state = ?
  `).bind(state).first();
  
  return result as { redirect_uri: string } | null;
}

export async function deleteOAuthState(db: D1Database, state: string): Promise<void> {
  await db.prepare(`
    DELETE FROM oauth_state WHERE state = ?
  `).bind(state).run();
}

export async function cleanupOldStates(db: D1Database): Promise<void> {
  // Delete states older than 10 minutes
  await db.prepare(`
    DELETE FROM oauth_state 
    WHERE created_at < datetime('now', '-10 minutes')
  `).run();
}

// API token management functions
export async function generateApiToken(db: D1Database, userId: string): Promise<string> {
  // Generate a shorter, more user-friendly token (16 characters)
  // This creates a base64 string and takes the first 16 characters
  const buffer = new Uint8Array(12); // 12 bytes = 16 base64 characters
  crypto.getRandomValues(buffer);
  const token = btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-') // Replace + with - (URL safe)
    .replace(/\//g, '_') // Replace / with _ (URL safe)
    .replace(/=/g, '')   // Remove padding
    .substring(0, 16);   // Ensure exactly 16 characters
  
  // First delete any existing tokens for this user
  await deleteApiTokens(db, userId);
  
  // Insert the new token
  await db.prepare(`
    INSERT INTO api_tokens (token, user_id)
    VALUES (?, ?)
  `).bind(token, userId).run();
  
  return token;
}

export async function getApiToken(db: D1Database, userId: string): Promise<string | null> {
  const result = await db.prepare(`
    SELECT token FROM api_tokens WHERE user_id = ?
  `).bind(userId).first();
  
  return result ? (result.token as string) : null;
}

export async function deleteApiTokens(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`
    DELETE FROM api_tokens WHERE user_id = ?
  `).bind(userId).run();
}

export async function validateApiToken(db: D1Database, token: string): Promise<string | null> {
  const result = await db.prepare(`
    SELECT user_id FROM api_tokens WHERE token = ?
  `).bind(token).first();
  
  return result ? (result.user_id as string) : null;
}

// User tier management functions

/**
 * Get a user's tier
 * @param db D1 Database instance
 * @param userId User ID
 * @returns The user's tier (defaults to 'seed' if not set)
 */
export async function getUserTier(db: D1Database, userId: string): Promise<UserTier> {
  const result = await db.prepare(`
    SELECT tier FROM user_tiers WHERE user_id = ?
  `).bind(userId).first();
  
  return result ? (result.tier as UserTier) : 'seed';
}

/**
 * Set a user's tier
 * @param db D1 Database instance
 * @param userId User ID
 * @param tier The tier to set
 */
export async function setUserTier(db: D1Database, userId: string, tier: UserTier): Promise<void> {
  await db.prepare(`
    INSERT INTO user_tiers (user_id, tier, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      tier = excluded.tier,
      updated_at = CURRENT_TIMESTAMP
  `).bind(userId, tier).run();
}

/**
 * Get all users with their tiers
 * @param db D1 Database instance
 * @returns Array of users with their tiers
 */
export async function getAllUserTiers(db: D1Database): Promise<Array<{user_id: string, username: string, tier: UserTier}>> {
  const results = await db.prepare(`
    SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
    FROM users u
    LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
    ORDER BY u.username
  `).all();
  
  return results.results as Array<{user_id: string, username: string, tier: UserTier}>;
}

/**
 * Find user by domain
 * @param db D1 Database instance
 * @param domain Domain to check
 * @returns User ID, username and tier if the domain is registered by any user, null otherwise
 */
export async function findUserByDomain(db: D1Database, domain: string): Promise<{user_id: string, username: string, tier: UserTier} | null> {
  console.log(`Checking if domain ${domain} is registered by any user`);
  
  try {
    // Find any user that has registered this domain
    const result = await db.prepare(`
      SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
      FROM domains d
      JOIN users u ON d.user_id = u.github_user_id
      LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
      WHERE d.domain = ?
      LIMIT 1
    `).bind(domain).first();
    
    if (!result) {
      console.log(`No user found for domain: ${domain}`);
      return null;
    }
    
    console.log(`Found user ${result.user_id} (${result.username}) with tier ${result.tier} for domain: ${domain}`);
    return {
      user_id: result.user_id as string,
      username: result.username as string,
      tier: result.tier as UserTier
    };
  } catch (error) {
    console.error('Error finding user by domain:', error);
    return null;
  }
}

// User preferences management functions

/**
 * Get user preferences
 * @param db D1 Database instance
 * @param userId User ID
 * @returns User preferences object (defaults to empty object if not set)
 */
export async function getUserPreferences(db: D1Database, userId: string): Promise<Record<string, any>> {
  const result = await db.prepare(`
    SELECT preferences FROM users WHERE github_user_id = ?
  `).bind(userId).first();
  
  if (!result || !result.preferences) {
    return {};
  }
  
  try {
    return JSON.parse(result.preferences as string);
  } catch (error) {
    console.error('Error parsing user preferences:', error);
    return {};
  }
}

/**
 * Set a specific user preference
 * @param db D1 Database instance
 * @param userId User ID
 * @param key Preference key
 * @param value Preference value
 */
export async function setUserPreference(db: D1Database, userId: string, key: string, value: any): Promise<void> {
  // Get current preferences
  const currentPrefs = await getUserPreferences(db, userId);
  
  // Update the specific preference
  currentPrefs[key] = value;
  
  // Save back to database
  await db.prepare(`
    UPDATE users 
    SET preferences = ?, updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `).bind(JSON.stringify(currentPrefs), userId).run();
}

/**
 * Update multiple user preferences at once
 * @param db D1 Database instance
 * @param userId User ID
 * @param preferences Object with preference key-value pairs to update
 */
export async function updateUserPreferences(db: D1Database, userId: string, preferences: Record<string, any>): Promise<void> {
  // Get current preferences
  const currentPrefs = await getUserPreferences(db, userId);
  
  // Merge with new preferences
  const updatedPrefs = { ...currentPrefs, ...preferences };
  
  // Save back to database
  await db.prepare(`
    UPDATE users 
    SET preferences = ?, updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `).bind(JSON.stringify(updatedPrefs), userId).run();
}

/**
 * Delete a user preference
 * @param db D1 Database instance
 * @param userId User ID
 * @param key Preference key to delete
 */
export async function deleteUserPreference(db: D1Database, userId: string, key: string): Promise<void> {
  // Get current preferences
  const currentPrefs = await getUserPreferences(db, userId);
  
  // Delete the key
  delete currentPrefs[key];
  
  // Save back to database
  await db.prepare(`
    UPDATE users 
    SET preferences = ?, updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `).bind(JSON.stringify(currentPrefs), userId).run();
}
