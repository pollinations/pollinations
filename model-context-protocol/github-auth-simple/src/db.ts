import type { User } from './types';

export async function upsertUser(db: D1Database, user: Partial<User> & { github_user_id: string }): Promise<User> {
  const allowlist = user.domain_allowlist ? JSON.stringify(user.domain_allowlist) : null;
  
  await db.prepare(`
    INSERT INTO users (github_user_id, username, avatar_url, email, domain_allowlist)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(github_user_id) DO UPDATE SET
      username = excluded.username,
      avatar_url = excluded.avatar_url,
      email = excluded.email,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    user.github_user_id,
    user.username!,
    user.avatar_url || null,
    user.email || null,
    allowlist
  ).run();
  
  return getUser(db, user.github_user_id) as Promise<User>;
}

export async function getUser(db: D1Database, userId: string): Promise<User | null> {
  const result = await db.prepare(`
    SELECT * FROM users WHERE github_user_id = ?
  `).bind(userId).first();
  
  if (!result) return null;
  
  return {
    ...result,
    domain_allowlist: result.domain_allowlist ? JSON.parse(result.domain_allowlist as string) : []
  } as User;
}

export async function updateDomainAllowlist(db: D1Database, userId: string, domains: string[]): Promise<void> {
  await db.prepare(`
    UPDATE users SET 
      domain_allowlist = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `).bind(JSON.stringify(domains), userId).run();
}

export async function isDomainAllowed(db: D1Database, userId: string, domain: string): Promise<boolean> {
  const user = await getUser(db, userId);
  if (!user || !user.domain_allowlist) return false;
  return user.domain_allowlist.includes(domain);
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
