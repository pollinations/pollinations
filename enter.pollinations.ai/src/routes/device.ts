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
import type { Env } from "../env";
import { createAuth } from "../auth";

const app = new Hono<Env>();

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
    
    // Validate the session token
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });
    
    if (!session?.user) {
        return c.json({ error: "Invalid or expired session token" }, 401);
    }
    
    // Generate device name from User-Agent
    const userAgent = c.req.header("User-Agent") || "CLI";
    const deviceName = userAgent.includes("curl") ? "CLI (curl)" 
        : userAgent.includes("node") ? "CLI (Node.js)"
        : userAgent.includes("python") ? "CLI (Python)"
        : "CLI Device";
    
    const keyName = `${deviceName} - ${new Date().toLocaleDateString()}`;
    
    // Create an API key for this user
    const keyResult = await auth.api.createApiKey({
        body: {
            name: keyName,
            prefix: "sk", // Secret key for full API access
            userId: session.user.id,
        },
    });

    if (!keyResult?.key) {
        return c.json({ error: "Failed to create API key" }, 500);
    }

    return c.json({
        api_key: keyResult.key,
        key_name: keyName,
        user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
        },
    });
});

export const deviceRoutes = app;
