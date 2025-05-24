import type { User } from './types';
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
