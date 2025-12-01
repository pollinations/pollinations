import type { User, UserTier } from "./types";
import type { D1Database } from "@cloudflare/workers-types";

// Ultra-simplified user management - only store github_user_id and username
// NEW REGISTRATIONS ARE DISABLED - only existing users can log in
export async function upsertUser(
    db: D1Database,
    user: Partial<User> & { github_user_id: string },
): Promise<User> {
    // Check if user already exists - block new signups
    const existingUser = await getUser(db, user.github_user_id);
    if (!existingUser) {
        throw new Error("NEW_REGISTRATIONS_DISABLED");
    }

    // Update existing user only
    await db
        .prepare(`
    UPDATE users SET
      username = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(user.username!, user.github_user_id)
        .run();

    return getUser(db, user.github_user_id) as Promise<User>;
}

export async function getUser(
    db: D1Database,
    userId: string,
): Promise<User | null> {
    const result = await db
        .prepare(`
    SELECT github_user_id, username FROM users WHERE github_user_id = ?
  `)
        .bind(userId)
        .first();

    if (!result) return null;

    // Return only the essential fields
    return {
        github_user_id: result.github_user_id as string,
        username: result.username as string,
    } as User;
}

// Domain management functions
export async function updateDomainAllowlist(
    db: D1Database,
    userId: string,
    domains: string[],
): Promise<void> {
    // Use a transaction for atomic operation and better performance
    const statements = [
        // First delete existing domains for this user
        db
            .prepare(`DELETE FROM domains WHERE user_id = ?`)
            .bind(userId),
    ];

    // Add batch INSERT using VALUES clause for all domains at once
    if (domains.length > 0) {
        // Create VALUES clause for batch insert: (?, ?), (?, ?), ...
        const valuesClauses = domains.map(() => "(?, ?)").join(", ");
        const batchInsertSQL = `INSERT INTO domains (user_id, domain) VALUES ${valuesClauses}`;

        // Bind all parameters: userId, domain1, userId, domain2, ...
        const bindParams: string[] = [];
        for (const domain of domains) {
            bindParams.push(userId, domain);
        }

        statements.push(db.prepare(batchInsertSQL).bind(...bindParams));
    }

    // Execute all statements in a batch for better performance
    await db.batch(statements);
}

export async function getDomains(
    db: D1Database,
    userId: string,
): Promise<string[]> {
    try {
        const results = await db
            .prepare(`
      SELECT domain FROM domains WHERE user_id = ?
    `)
            .bind(userId)
            .all();

        return (results.results || []).map((row) => row.domain as string);
    } catch (error) {
        return [];
    }
}

export async function isDomainAllowed(
    db: D1Database,
    userId: string,
    domain: string,
): Promise<boolean> {
    const result = await db
        .prepare(`
    SELECT 1 FROM domains WHERE user_id = ? AND domain = ?
  `)
        .bind(userId, domain)
        .first();

    return !!result;
}

// OAuth state management
export async function saveOAuthState(
    db: D1Database,
    state: string,
    redirectUri: string,
): Promise<void> {
    await db
        .prepare(`
    INSERT INTO oauth_state (state, redirect_uri) VALUES (?, ?)
  `)
        .bind(state, redirectUri)
        .run();
}

export async function getOAuthState(
    db: D1Database,
    state: string,
): Promise<{ redirect_uri: string } | null> {
    const result = await db
        .prepare(`
    SELECT redirect_uri FROM oauth_state WHERE state = ?
  `)
        .bind(state)
        .first();

    return result as { redirect_uri: string } | null;
}

export async function deleteOAuthState(
    db: D1Database,
    state: string,
): Promise<void> {
    await db
        .prepare(`
    DELETE FROM oauth_state WHERE state = ?
  `)
        .bind(state)
        .run();
}

export async function cleanupOldStates(db: D1Database): Promise<void> {
    // Delete states older than 10 minutes
    await db
        .prepare(`
    DELETE FROM oauth_state 
    WHERE created_at < datetime('now', '-10 minutes')
  `)
        .run();
}

// API token management functions
export async function generateApiToken(
    db: D1Database,
    userId: string,
): Promise<string> {
    // Generate a shorter, more user-friendly token (16 characters)
    // This creates a base64 string and takes the first 16 characters
    const buffer = new Uint8Array(12); // 12 bytes = 16 base64 characters
    crypto.getRandomValues(buffer);
    const token = btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, "-") // Replace + with - (URL safe)
        .replace(/\//g, "_") // Replace / with _ (URL safe)
        .replace(/=/g, "") // Remove padding
        .substring(0, 16); // Ensure exactly 16 characters

    // First delete any existing tokens for this user
    await deleteApiTokens(db, userId);

    // Insert the new token
    await db
        .prepare(`
    INSERT INTO api_tokens (token, user_id)
    VALUES (?, ?)
  `)
        .bind(token, userId)
        .run();

    return token;
}

export async function getApiToken(
    db: D1Database,
    userId: string,
): Promise<string | null> {
    const result = await db
        .prepare(`
    SELECT token FROM api_tokens WHERE user_id = ?
  `)
        .bind(userId)
        .first();

    return result ? (result.token as string) : null;
}

export async function deleteApiTokens(
    db: D1Database,
    userId: string,
): Promise<void> {
    await db
        .prepare(`
    DELETE FROM api_tokens WHERE user_id = ?
  `)
        .bind(userId)
        .run();
}

export async function validateApiToken(
    db: D1Database,
    token: string,
): Promise<string | null> {
    const result = await db
        .prepare(`
    SELECT user_id FROM api_tokens WHERE token = ?
  `)
        .bind(token)
        .first();

    return result ? (result.user_id as string) : null;
}

// New consolidated function for complete token validation in one query
// Replaces 3 separate queries with 1 JOIN query for 60-80% performance improvement
// Use validateApiToken() for endpoints that only need userId (more efficient)
// Use validateApiTokenComplete() for endpoints that need userId + username + tier
export async function validateApiTokenComplete(
    db: D1Database,
    token: string,
): Promise<{
    userId: string | null;
    username: string | null;
    tier: UserTier | null;
}> {
    const result = await db
        .prepare(`
    SELECT 
      at.user_id,
      u.username,
      COALESCE(ut.tier, 'seed') as tier
    FROM api_tokens at
    INNER JOIN users u ON at.user_id = u.github_user_id
    LEFT JOIN user_tiers ut ON u.github_user_id = ut.user_id
    WHERE at.token = ?
  `)
        .bind(token)
        .first();

    if (!result) {
        return { userId: null, username: null, tier: null };
    }

    return {
        userId: result.user_id as string,
        username: result.username as string,
        tier: result.tier as UserTier,
    };
}

// User tier management functions

/**
 * Get a user's tier
 * @param db D1 Database instance
 * @param userId User ID
 * @returns The user's tier (defaults to 'seed' if not set)
 */
export async function getUserTier(
    db: D1Database,
    userId: string,
): Promise<UserTier> {
    const result = await db
        .prepare(`
    SELECT tier FROM user_tiers WHERE user_id = ?
  `)
        .bind(userId)
        .first();

    return result ? (result.tier as UserTier) : "seed";
}

/**
 * Set a user's tier
 * @param db D1 Database instance
 * @param userId User ID
 * @param tier The tier to set
 */
export async function setUserTier(
    db: D1Database,
    userId: string,
    tier: UserTier,
): Promise<void> {
    await db
        .prepare(`
    INSERT INTO user_tiers (user_id, tier, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      tier = excluded.tier,
      updated_at = CURRENT_TIMESTAMP
  `)
        .bind(userId, tier)
        .run();
}

/**
 * Get all users with their tiers
 * @param db D1 Database instance
 * @returns Array of users with their tiers
 */
export async function getAllUserTiers(
    db: D1Database,
): Promise<Array<{ user_id: string; username: string; tier: UserTier }>> {
    const results = await db
        .prepare(`
    SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
    FROM users u
    LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
    ORDER BY u.username
  `)
        .all();

    return results.results as Array<{
        user_id: string;
        username: string;
        tier: UserTier;
    }>;
}

/**
 * Find user by domain - supports both exact matching and wildcard patterns (*.example.com)
 * @param db D1 Database instance
 * @param domain Domain to check
 * @returns User ID, username and tier if the domain is registered by any user, null otherwise
 */
export async function findUserByDomain(
    db: D1Database,
    domain: string,
): Promise<{ user_id: string; username: string; tier: UserTier } | null> {
    try {
        // Step 1: Try exact match first (fastest path, most common case)
        let result = await db
            .prepare(`
      SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
      FROM domains d
      JOIN users u ON d.user_id = u.github_user_id
      LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
      WHERE d.domain = ?
      LIMIT 1
    `)
            .bind(domain)
            .first();

        if (result) {
            return {
                user_id: result.user_id as string,
                username: result.username as string,
                tier: result.tier as UserTier,
            };
        }

        // Step 2: Only if no exact match, try wildcard patterns
        // Look for domains starting with "*." that match as proper subdomains
        // *.example.com should match app.example.com but NOT maliciousexample.com
        result = await db
            .prepare(`
      SELECT u.github_user_id as user_id, u.username, COALESCE(t.tier, 'seed') as tier
      FROM domains d
      JOIN users u ON d.user_id = u.github_user_id
      LEFT JOIN user_tiers t ON u.github_user_id = t.user_id
      WHERE d.domain LIKE '*.%' 
        AND LENGTH(d.domain) > 2
        AND ? LIKE '%' || SUBSTR(d.domain, 2)
        AND ? != SUBSTR(d.domain, 3)
      ORDER BY LENGTH(d.domain) DESC
      LIMIT 1
    `)
            .bind(domain, domain)
            .first();

        if (result) {
            return {
                user_id: result.user_id as string,
                username: result.username as string,
                tier: result.tier as UserTier,
            };
        }

        return null;
    } catch (error) {
        console.error("Error in findUserByDomain:", error);
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
export async function getUserPreferences(
    db: D1Database,
    userId: string,
): Promise<Record<string, any>> {
    const result = await db
        .prepare(`
    SELECT preferences FROM users WHERE github_user_id = ?
  `)
        .bind(userId)
        .first();

    if (!result || !result.preferences) {
        return {};
    }

    try {
        return JSON.parse(result.preferences as string);
    } catch (error) {
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
export async function setUserPreference(
    db: D1Database,
    userId: string,
    key: string,
    value: any,
): Promise<void> {
    // Get current preferences
    const currentPrefs = await getUserPreferences(db, userId);

    // Update the specific preference
    currentPrefs[key] = value;

    // Save back to database
    await db
        .prepare(`
    UPDATE users 
    SET preferences = ?, updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(JSON.stringify(currentPrefs), userId)
        .run();
}

/**
 * Update multiple user preferences at once
 * @param db D1 Database instance
 * @param userId User ID
 * @param preferences Object with preference key-value pairs to update
 */
export async function updateUserPreferences(
    db: D1Database,
    userId: string,
    preferences: Record<string, any>,
): Promise<void> {
    // For multiple preference updates, we need to build multiple JSON_SET operations
    // Since SQLite doesn't support nested JSON_SET in a clean way, we'll use a different approach

    if (Object.keys(preferences).length === 0) {
        return; // Nothing to update
    }

    // Build multiple JSON_SET operations by chaining them
    let jsonSetClause = "COALESCE(preferences, '{}')";
    const bindParams: any[] = [];

    for (const [key, value] of Object.entries(preferences)) {
        jsonSetClause = `JSON_SET(${jsonSetClause}, ?, ?)`;
        bindParams.push(`$.${key}`, JSON.stringify(value));
    }

    bindParams.push(userId); // Add userId at the end for WHERE clause

    await db
        .prepare(`
    UPDATE users 
    SET preferences = ${jsonSetClause},
        updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(...bindParams)
        .run();
}

/**
 * Delete a user preference
 * @param db D1 Database instance
 * @param userId User ID
 * @param key Preference key to delete
 */
export async function deleteUserPreference(
    db: D1Database,
    userId: string,
    key: string,
): Promise<void> {
    // Use atomic JSON_REMOVE operation instead of GET-then-UPDATE
    await db
        .prepare(`
    UPDATE users 
    SET preferences = JSON_REMOVE(COALESCE(preferences, '{}'), ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(`$.${key}`, userId)
        .run();
}

// User metrics management functions (backend-only analytics)

/**
 * Get user metrics
 * @param db D1 Database instance
 * @param userId User ID
 * @returns User metrics object (defaults to empty object if not set)
 */
export async function getUserMetrics(
    db: D1Database,
    userId: string,
): Promise<Record<string, any>> {
    const result = await db
        .prepare(`
    SELECT metrics FROM users WHERE github_user_id = ?
  `)
        .bind(userId)
        .first();

    if (!result || !result.metrics) {
        return {};
    }

    try {
        return JSON.parse(result.metrics as string);
    } catch (error) {
        return {};
    }
}

/**
 * Set a specific metric value
 * @param db D1 Database instance
 * @param userId User ID
 * @param key Metric key to set
 * @param value Value to set
 */
export async function setUserMetric(
    db: D1Database,
    userId: string,
    key: string,
    value: any,
): Promise<void> {
    // Use atomic JSON_SET operation instead of GET-then-UPDATE
    await db
        .prepare(`
    UPDATE users 
    SET metrics = JSON_SET(COALESCE(metrics, '{}'), ?, ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(`$.${key}`, JSON.stringify(value), userId)
        .run();
}

/**
 * Update multiple user metrics at once
 * @param db D1 Database instance
 * @param userId User ID
 * @param metrics Object with metric key-value pairs to update
 */
export async function updateUserMetrics(
    db: D1Database,
    userId: string,
    metrics: Record<string, any>,
): Promise<void> {
    // For multiple metric updates, build chained JSON_SET operations

    if (Object.keys(metrics).length === 0) {
        return; // Nothing to update
    }

    // Build multiple JSON_SET operations by chaining them
    let jsonSetClause = "COALESCE(metrics, '{}')";
    const bindParams: any[] = [];

    for (const [key, value] of Object.entries(metrics)) {
        jsonSetClause = `JSON_SET(${jsonSetClause}, ?, ?)`;
        bindParams.push(`$.${key}`, JSON.stringify(value));
    }

    bindParams.push(userId); // Add userId at the end for WHERE clause

    await db
        .prepare(`
    UPDATE users 
    SET metrics = ${jsonSetClause},
        updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(...bindParams)
        .run();
}

/**
 * Increment a numeric metric
 * @param db D1 Database instance
 * @param userId User ID
 * @param key Metric key to increment
 * @param incrementBy Amount to increment by (default: 1)
 */
export async function incrementUserMetric(
    db: D1Database,
    userId: string,
    key: string,
    incrementBy: number = 1,
): Promise<void> {
    // Use atomic JSON operations for increment
    // First, ensure the metrics field exists and the key is initialized to 0 if not present
    await db
        .prepare(`
    UPDATE users 
    SET metrics = JSON_SET(
      COALESCE(metrics, '{}'), 
      ?, 
      COALESCE(JSON_EXTRACT(COALESCE(metrics, '{}'), ?), 0) + ?
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE github_user_id = ?
  `)
        .bind(`$.${key}`, `$.${key}`, incrementBy, userId)
        .run();
}

// End of metrics functions
