/**
 * Database service for GitHub authentication
 * 
 * Follows the "thin proxy" design principle by keeping operations simple
 * and avoiding unnecessary transformations.
 */

import type { Env, User, AuthSession } from './types';

/**
 * Creates a new authentication session
 */
export async function createAuthSession(db: D1Database, state: string): Promise<string> {
  // Generate a random session ID using Web Crypto API
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  const sessionId = Array.from(buffer)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  
  await db.prepare(
    `INSERT INTO auth_sessions (session_id, state, status) VALUES (?, ?, ?)`
  )
  .bind(sessionId, state, 'pending')
  .run();
  
  return sessionId;
}

/**
 * Gets an authentication session by ID
 */
export async function getAuthSession(db: D1Database, sessionId: string): Promise<AuthSession | null> {
  const result = await db.prepare(
    `SELECT * FROM auth_sessions WHERE session_id = ?`
  )
  .bind(sessionId)
  .first();
  
  return result as AuthSession | null;
}

/**
 * Updates an authentication session with user info
 */
export async function completeAuthSession(
  db: D1Database, 
  sessionId: string, 
  githubUserId: string
): Promise<void> {
  await db.prepare(
    `UPDATE auth_sessions SET github_user_id = ?, status = ? WHERE session_id = ?`
  )
  .bind(githubUserId, 'complete', sessionId)
  .run();
}

/**
 * Creates or updates a user record
 */
export async function upsertUser(
  db: D1Database, 
  user: User
): Promise<void> {
  console.log('Upserting user:', JSON.stringify(user));
  
  // Check if user exists
  const existingUser = await db.prepare(
    `SELECT * FROM users WHERE github_user_id = ?`
  )
  .bind(user.github_user_id)
  .first();
  
  if (existingUser) {
    // Update existing user - only update fields that are provided
    // Use a simpler query that only updates the required fields
    await db.prepare(
      `UPDATE users 
       SET username = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE github_user_id = ?`
    )
    .bind(
      user.username,
      user.github_user_id
    )
    .run();
    
    console.log('Updated existing user:', user.github_user_id);
  } else {
    // Create new user with minimal required fields
    await db.prepare(
      `INSERT INTO users (
         github_user_id, 
         username
       ) VALUES (?, ?)`
    )
    .bind(
      user.github_user_id,
      user.username
    )
    .run();
    
    console.log('Created new user:', user.github_user_id);
  }
}

/**
 * Gets a user by GitHub ID
 */
export async function getUserByGithubId(db: D1Database, githubUserId: string): Promise<User | null> {
  const result = await db.prepare(
    `SELECT * FROM users WHERE github_user_id = ?`
  )
  .bind(githubUserId)
  .first();
  
  return result as User | null;
}

/**
 * Updates a user's installation token
 */
export async function updateInstallationToken(
  db: D1Database,
  githubUserId: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  await db.prepare(
    `UPDATE users 
     SET installation_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
     WHERE github_user_id = ?`
  )
  .bind(token, expiresAt.toISOString(), githubUserId)
  .run();
}

/**
 * Updates a user's domain allowlist
 */
export async function updateDomainAllowlist(
  db: D1Database,
  githubUserId: string,
  domains: string[]
): Promise<void> {
  await db.prepare(
    `UPDATE users 
     SET domain_allowlist = ?, updated_at = CURRENT_TIMESTAMP
     WHERE github_user_id = ?`
  )
  .bind(JSON.stringify(domains), githubUserId)
  .run();
}

/**
 * Checks if a domain is allowlisted for a user
 */
export async function isDomainAllowlisted(
  db: D1Database,
  githubUserId: string,
  domain: string
): Promise<boolean> {
  const user = await getUserByGithubId(db, githubUserId);
  
  if (!user || !user.domain_allowlist) {
    return false;
  }
  
  try {
    const allowlist = JSON.parse(user.domain_allowlist) as string[];
    return allowlist.includes(domain);
  } catch (error) {
    return false;
  }
}
