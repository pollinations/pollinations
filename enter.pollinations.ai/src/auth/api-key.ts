import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth.ts";
import type { Auth, Session } from "../auth.ts";

export interface ApiKeyAuthResult {
    valid: boolean;
    user?: Session["user"];
    keyType?: "frontend" | "server";
    error?: string;
}

/**
 * Verify API key and return associated user.
 * Handles the full API key authentication flow:
 * 1. Verifies the API key with better-auth
 * 2. Fetches the associated user from the database
 * 3. Returns the user if valid, or an error if not
 */
export async function verifyApiKeyAndGetUser(
    auth: Auth,
    env: CloudflareBindings,
    apiKey: string
): Promise<ApiKeyAuthResult> {
    // Verify API key using better-auth
    const result = await auth.api.verifyApiKey({
        body: { key: apiKey },
    });

    if (!result.valid || !result.key) {
        return {
            valid: false,
            error: "Invalid API key",
        };
    }

    // Fetch user from database
    const db = drizzle(env.DB);
    const users = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, result.key.userId))
        .limit(1);

    if (users.length === 0) {
        return {
            valid: false,
            error: "User not found",
        };
    }

    // Extract key type from metadata
    const keyType = (result.key.metadata as any)?.keyType as "frontend" | "server" | undefined;

    return {
        valid: true,
        user: users[0] as Session["user"],
        keyType: keyType || "server", // Default to server if not specified
    };
}

/**
 * Extract API key from Authorization header.
 * Supports: Authorization: Bearer <api-key>
 * 
 * @param authHeader - The Authorization header value
 * @returns The API key if found, null otherwise
 */
export function extractApiKey(authHeader?: string): string | null {
    if (!authHeader) return null;

    const normalized = authHeader.trim();
    if (
        normalized.length > 7 &&
        normalized.substring(0, 7).toLowerCase() === "bearer "
    ) {
        return normalized.substring(7).trim();
    }

    return null;
}
