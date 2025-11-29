/**
 * Device Routes - Extends better-auth's device authorization plugin
 *
 * The main device flow is handled by better-auth's deviceAuthorization plugin:
 * - POST /api/auth/device/code - Request device code
 * - POST /api/auth/device/token - Poll for access token (returns session token)
 * - GET /api/auth/device - Verify user code
 * - POST /api/auth/device/approve - Approve device (requires auth)
 * - POST /api/auth/device/deny - Deny device (requires auth)
 *
 * This file adds a custom endpoint to exchange a session token for an OAuth access token,
 * making the device flow useful for API access (similar to OIDC flow).
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth";
import type { Env } from "../env";
import { nanoid } from "nanoid";

const app = new Hono<Env>();

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer (.+)$/i);
    return match?.[1] || null;
}

// Token expiry: 60 minutes (same as OIDC flow)
const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60;

/**
 * POST /exchange-for-access-token
 * Exchange a session token (from device flow) for an OAuth access token (for /api/generate)
 *
 * Usage:
 *   1. Complete device flow via /api/auth/device/* endpoints
 *   2. Get session token (access_token) from /api/auth/device/token
 *   3. Call this endpoint with the session token to get an OAuth access token
 *
 * Request: Authorization: Bearer <session_token>
 * Response: { access_token: "...", token_type: "Bearer", expires_in: 3600 }
 */
app.post("/exchange-for-access-token", async (c) => {
    const db = drizzle(c.env.DB, { schema });

    // Extract Bearer token
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
        return c.json(
            { error: "Missing Authorization: Bearer <token> header" },
            401,
        );
    }

    // Validate session token directly against database
    // (better-auth's getSession() expects cookies, but device flow uses Bearer tokens)
    const sessionRecord = await db.query.session.findFirst({
        where: eq(schema.session.token, token),
    });

    if (!sessionRecord) {
        return c.json({ error: "Invalid session token" }, 401);
    }

    if (sessionRecord.expiresAt < new Date()) {
        return c.json({ error: "Session token expired" }, 401);
    }

    // Get user
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, sessionRecord.userId),
    });

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    // Generate OAuth access token (same format as OIDC provider)
    const accessToken = nanoid(32);
    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
    );

    // Insert into oauth_access_token table (same table used by OIDC flow)
    await db.insert(schema.oauthAccessToken).values({
        id: nanoid(),
        accessToken,
        accessTokenExpiresAt: expiresAt,
        clientId: "pollinations-cli", // Device flow client
        userId: user.id,
        scopes: "openid profile email",
        createdAt: now,
        updatedAt: now,
    });

    return c.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
        scope: "openid profile email",
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
    });
});

/**
 * POST /exchange-for-api-key (DEPRECATED - use /exchange-for-access-token)
 * Kept for backwards compatibility, but now returns an OAuth access token
 */
app.post("/exchange-for-api-key", async (c) => {
    const db = drizzle(c.env.DB, { schema });

    // Extract Bearer token
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
        return c.json(
            { error: "Missing Authorization: Bearer <token> header" },
            401,
        );
    }

    // Validate session token directly against database
    const sessionRecord = await db.query.session.findFirst({
        where: eq(schema.session.token, token),
    });

    if (!sessionRecord) {
        return c.json({ error: "Invalid session token" }, 401);
    }

    if (sessionRecord.expiresAt < new Date()) {
        return c.json({ error: "Session token expired" }, 401);
    }

    // Get user
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, sessionRecord.userId),
    });

    if (!user) {
        return c.json({ error: "User not found" }, 401);
    }

    // Generate OAuth access token (same format as OIDC provider)
    const accessToken = nanoid(32);
    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
    );

    // Insert into oauth_access_token table
    await db.insert(schema.oauthAccessToken).values({
        id: nanoid(),
        accessToken,
        accessTokenExpiresAt: expiresAt,
        clientId: "pollinations-cli",
        userId: user.id,
        scopes: "openid profile email",
        createdAt: now,
        updatedAt: now,
    });

    // Return in old format for backwards compatibility, but with OAuth token
    return c.json({
        api_key: accessToken, // Actually an OAuth token now
        key_name: `CLI Access Token - expires ${expiresAt.toLocaleString()}`,
        expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
    });
});

export const deviceRoutes = app;
