/**
 * Shared authentication utilities for both session and API key auth
 */
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema/better-auth.ts";
import type { Context } from "hono";
import type { Auth, User, Session } from "@/auth.ts";
import type { Logger } from "@logtape/logtape";

export type ApiKey = {
    id: string;
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
};

export type AuthResult = {
    user?: User;
    session?: Session;
    apiKey?: ApiKey;
};

/**
 * Extracts Bearer token from Authorization header (RFC 6750) or query parameter
 */
export function extractApiKey(c: Context): string | null {
    // Try Authorization header first (RFC 6750)
    const auth = c.req.header("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    if (match?.[1]) return match[1];

    // Fallback to query parameter for GET requests (browser-friendly)
    return c.req.query("key") || null;
}

/**
 * Authenticates using session cookie via better-auth
 */
export async function authenticateSession(
    client: Auth,
    headers: Headers,
    log?: Logger,
): Promise<AuthResult | null> {
    const result = await client.api.getSession({ headers });
    if (!result?.user) return null;
    
    log?.debug("[AUTH] Session authentication successful", {
        userId: result.user.id,
    });
    
    return {
        user: result.user,
        session: result.session,
    };
}

/**
 * Authenticates using API key via better-auth
 */
export async function authenticateApiKey(
    client: Auth,
    apiKey: string,
    env: CloudflareBindings,
    log?: Logger,
): Promise<AuthResult | null> {
    log?.debug("[AUTH] Verifying API key", {
        keyPrefix: apiKey.substring(0, 8),
    });
    
    // Verify API key with better-auth
    const keyResult = await client.api.verifyApiKey({
        body: { key: apiKey },
    });
    
    log?.debug("[AUTH] API key verification result", {
        valid: keyResult.valid,
    });
    
    if (!keyResult.valid || !keyResult.key) return null;
    
    // Look up user from database
    const db = drizzle(env.DB, { schema });
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, keyResult.key.userId),
    });
    
    log?.debug("[AUTH] User lookup result", {
        found: !!user,
        userId: user?.id,
    });
    
    if (!user) return null;
    
    return {
        user: user as User,
        apiKey: {
            id: keyResult.key.id,
            name: keyResult.key.name || undefined,
            permissions: keyResult.key.permissions || undefined,
            metadata: keyResult.key.metadata || undefined,
        },
    };
}

/**
 * Creates a requireAuthorization helper function
 */
export function createRequireAuthorization(
    user: User | undefined,
    log?: Logger,
) {
    return async (options?: {
        allowAnonymous?: boolean;
        message?: string;
    }): Promise<void> => {
        log?.debug("[AUTH] Checking authorization", {
            hasUser: !!user,
            allowAnonymous: options?.allowAnonymous,
        });
        
        if (!user && !options?.allowAnonymous) {
            log?.debug("[AUTH] Authorization failed: No user and anonymous not allowed");
            throw new HTTPException(401, {
                message: options?.message || "Authentication required",
            });
        }
    };
}

/**
 * Creates a requireUser helper function
 */
export function createRequireUser(user: User | undefined) {
    return (): User => {
        if (!user) {
            throw new HTTPException(401, { message: "Authentication required" });
        }
        return user;
    };
}
