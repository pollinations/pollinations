/**
 * Shared authentication logic for validating API keys
 * Used by enter.pollinations.ai and gen.pollinations.ai
 */

import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

export type ApiKeyValidationResult = {
    valid: boolean;
    user?: {
        id: string;
        githubId: number;
        tier: string;
        name: string;
        email: string;
    };
    apiKey?: {
        id: string;
        name: string | null;
    };
};

/**
 * Validates an API key and returns associated user information
 * Checks that key is enabled and not expired
 */
export async function validateApiKey(
    db: D1Database,
    apiKey: string
): Promise<ApiKeyValidationResult> {
    const drizzleDb = drizzle(db, { schema });
    
    const result = await drizzleDb.query.apikey.findFirst({
        where: and(
            eq(schema.apikey.key, apiKey),
            eq(schema.apikey.enabled, true)
        ),
        with: {
            user: true,
        },
    });

    if (!result || !result.user) {
        return { valid: false };
    }

    // Check if key is expired
    if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
        return { valid: false };
    }

    return {
        valid: true,
        user: {
            id: result.user.id,
            githubId: result.user.githubId!,
            tier: result.user.tier,
            name: result.user.name,
            email: result.user.email,
        },
        apiKey: {
            id: result.id,
            name: result.name || null,
        },
    };
}
