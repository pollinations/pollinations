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
 * This file adds a custom endpoint to exchange a session token for an API key,
 * making the device flow useful for API access (not just dashboard access).
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth";
import type { Env } from "../env";
import { createAuth } from "../auth";

const app = new Hono<Env>();

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer (.+)$/i);
    return match?.[1] || null;
}

/**
 * POST /exchange-for-api-key
 * Exchange a session token (from device flow) for an API key (for /api/generate)
 *
 * Usage:
 *   1. Complete device flow via /api/auth/device/* endpoints
 *   2. Get session token (access_token) from /api/auth/device/token
 *   3. Call this endpoint with the session token to get an sk_ API key
 *
 * Request: Authorization: Bearer <session_token>
 * Response: { api_key: "sk_...", key_name: "CLI Device - 11/29/25" }
 */
app.post("/exchange-for-api-key", async (c) => {
    const auth = createAuth(c.env);
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

    // Generate device name from User-Agent
    const userAgent = c.req.header("User-Agent") || "CLI";
    const deviceName = userAgent.includes("curl")
        ? "CLI (curl)"
        : userAgent.includes("node")
          ? "CLI (Node.js)"
          : userAgent.includes("python")
            ? "CLI (Python)"
            : "CLI Device";

    const keyName = `${deviceName} - ${new Date().toLocaleDateString()}`;

    // Create an API key for this user
    const keyResult = await auth.api.createApiKey({
        body: {
            name: keyName,
            prefix: "sk", // Secret key for full API access
            userId: user.id,
        },
    });

    if (!keyResult?.key) {
        return c.json({ error: "Failed to create API key" }, 500);
    }

    return c.json({
        api_key: keyResult.key,
        key_name: keyName,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
    });
});

export const deviceRoutes = app;
