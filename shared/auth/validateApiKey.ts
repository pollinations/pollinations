/**
 * Minimal test: API key validation using drizzle-orm from shared
 * If this works, we can move more auth logic here
 */

export type ApiKeyValidationResult = {
    valid: boolean;
    user?: {
        id: string;
        githubId: number;
        tier: string;
    };
};

/**
 * Validates an API key using raw SQL
 * Simple test - no drizzle imports yet
 */
export async function validateApiKey(
    db: D1Database,
    apiKey: string
): Promise<ApiKeyValidationResult> {
    const result = await db.prepare(`
        SELECT 
            u.id as userId,
            u.github_id as githubId,
            u.tier as tier,
            k.expires_at as expiresAt
        FROM apikey k
        INNER JOIN user u ON k.user_id = u.id
        WHERE k.key = ? AND k.enabled = 1
        LIMIT 1
    `).bind(apiKey).first();

    if (!result) {
        return { valid: false };
    }

    // Check if key is expired
    if (result.expiresAt && new Date(result.expiresAt as number) < new Date()) {
        return { valid: false };
    }

    return {
        valid: true,
        user: {
            id: result.userId as string,
            githubId: result.githubId as number,
            tier: result.tier as string,
        },
    };
}
