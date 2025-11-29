import { Hono } from "hono";
import { validator } from "../middleware/validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema/better-auth";
import {
    deviceVerification,
    session as sessionTable,
    user as userTable,
    apikey,
} from "../db/schema/better-auth";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { createAuth } from "../auth";

/**
 * Extract Bearer token from Authorization header (RFC 6750)
 */
function extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer (.+)$/);
    return match?.[1] || null;
}

type SessionUser = typeof schema.user.$inferSelect;
type SessionRecord = typeof schema.session.$inferSelect;

/**
 * Validate a session token and return the user
 * This enables RFC 8628 compliant Bearer token usage for CLI/API clients
 */
async function validateBearerSession(
    db: ReturnType<typeof drizzle<typeof schema>>,
    token: string,
): Promise<{ session: SessionRecord; user: SessionUser } | null> {
    const sessionRecord = await db.query.session.findFirst({
        where: eq(sessionTable.token, token),
    });

    if (!sessionRecord) return null;
    if (sessionRecord.expiresAt < new Date()) return null;

    const user = await db.query.user.findFirst({
        where: eq(userTable.id, sessionRecord.userId),
    });

    if (!user) return null;

    return { session: sessionRecord, user };
}

const app = new Hono<Env>();

// Generate a random code
function generateCode(length: number, numeric = false) {
    const chars = numeric ? "0123456789" : "BCDFGHJKLMNPQRSTVWXZ"; // Readable chars
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomBytes, (byte) => chars[byte % chars.length]).join(
        "",
    );
}

// POST /code - Generate device and user codes
app.post("/code", async (c) => {
    const db = drizzle(c.env.DB, { schema });

    const deviceCode = crypto.randomUUID();
    const userCode = generateCode(8); // 8 chars, e.g. "BCDF-GHJK" formatted later if needed

    // Format user code for readability (e.g. XXXX-XXXX)
    const formattedUserCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;

    const url = new URL(c.req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    await db.insert(deviceVerification).values({
        id: crypto.randomUUID(),
        deviceCode,
        userCode: formattedUserCode,
        verificationUri: `${baseUrl}/device`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 10), // 10 minutes
    });

    return c.json({
        device_code: deviceCode,
        user_code: formattedUserCode,
        verification_uri: `${baseUrl}/device`,
        verification_uri_complete: `${baseUrl}/device?code=${formattedUserCode}`,
        expires_in: 600,
        interval: 5,
    });
});

// POST /verify - Verify user code (User action)
app.post(
    "/verify",
    validator(
        "json",
        z.object({
            user_code: z.string(),
        }),
    ),
    async (c) => {
        const { user_code } = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });
        const auth = createAuth(c.env);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const record = await db.query.deviceVerification.findFirst({
            where: eq(deviceVerification.userCode, user_code),
        });

        if (!record) {
            return c.json({ error: "Invalid code" }, 400);
        }

        if (record.expiresAt < new Date()) {
            return c.json({ error: "Code expired" }, 400);
        }

        if (record.verified) {
            return c.json({ message: "Already verified" });
        }

        await db
            .update(deviceVerification)
            .set({
                verified: true,
                userId: session.user.id,
                updatedAt: new Date(),
            })
            .where(eq(deviceVerification.id, record.id));

        return c.json({ success: true });
    },
);

// POST /token - Poll for token (Device action)
app.post(
    "/token",
    validator(
        "json",
        z.object({
            device_code: z.string(),
        }),
    ),
    async (c) => {
        const { device_code } = c.req.valid("json");
        const db = drizzle(c.env.DB, { schema });

        const record = await db.query.deviceVerification.findFirst({
            where: eq(deviceVerification.deviceCode, device_code),
        });

        if (!record) {
            return c.json({ error: "invalid_grant" }, 400);
        }

        if (record.expiresAt < new Date()) {
            return c.json({ error: "expired_token" }, 400);
        }

        if (!record.verified || !record.userId) {
            return c.json({ error: "authorization_pending" }, 400);
        }

        // Create an API key for the user (instead of session token)
        // This allows immediate use with /api/generate routes
        const auth = createAuth(c.env);

        // Generate device name from User-Agent or use default
        const userAgent = c.req.header("User-Agent") || "CLI";
        const deviceName = userAgent.includes("curl")
            ? "CLI (curl)"
            : userAgent.includes("node")
              ? "CLI (Node.js)"
              : userAgent.includes("python")
                ? "CLI (Python)"
                : "CLI Device";

        const keyName = `${deviceName} - ${new Date().toLocaleDateString()}`;

        // Use better-auth's API to create a secret key
        const keyResult = await auth.api.createApiKey({
            body: {
                name: keyName,
                prefix: "sk", // Secret key for full API access
                userId: record.userId,
            },
        });

        if (!keyResult?.key) {
            return c.json({ error: "failed_to_create_key" }, 500);
        }

        // Cleanup verification record
        await db
            .delete(deviceVerification)
            .where(eq(deviceVerification.id, record.id));

        return c.json({
            access_token: keyResult.key, // Return the actual sk_ key
            token_type: "Bearer",
            // API keys don't expire by default, but we can indicate this
            expires_in: null,
            key_name: keyName,
        });
    },
);

// ============================================================================
// RFC 8628 Bearer Token Endpoints
// These endpoints accept Bearer tokens from the device flow for CLI/API access
// ============================================================================

/**
 * GET /session - Get current session info using Bearer token (RFC 8628)
 * This is the proper way to validate device flow tokens
 *
 * Usage: curl -H "Authorization: Bearer $ACCESS_TOKEN" /api/device/session
 */
app.get("/session", async (c) => {
    const db = drizzle(c.env.DB, { schema });
    const token = extractBearerToken(c.req.header("authorization"));

    if (!token) {
        return c.json({ error: "Missing Authorization header" }, 401);
    }

    const result = await validateBearerSession(db, token);

    if (!result) {
        return c.json({ error: "Invalid or expired token" }, 401);
    }

    return c.json({
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            image: result.user.image,
            tier: result.user.tier,
            githubUsername: result.user.githubUsername,
        },
        session: {
            id: result.session.id,
            expiresAt: result.session.expiresAt,
            createdAt: result.session.createdAt,
        },
    });
});

/**
 * GET /api-keys - List API keys for the authenticated user (RFC 8628)
 *
 * Usage: curl -H "Authorization: Bearer $ACCESS_TOKEN" /api/device/api-keys
 */
app.get("/api-keys", async (c) => {
    const db = drizzle(c.env.DB, { schema });
    const token = extractBearerToken(c.req.header("authorization"));

    if (!token) {
        return c.json({ error: "Missing Authorization header" }, 401);
    }

    const result = await validateBearerSession(db, token);

    if (!result) {
        return c.json({ error: "Invalid or expired token" }, 401);
    }

    // Fetch API keys for this user
    const keys = await db.query.apikey.findMany({
        where: eq(apikey.userId, result.user.id),
    });

    // Return keys without the actual key value (security)
    return c.json({
        keys: keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            start: k.start,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            enabled: k.enabled,
        })),
    });
});

/**
 * GET /me - Simplified endpoint to get current user info (RFC 8628)
 * Alias for /session but returns just the user
 *
 * Usage: curl -H "Authorization: Bearer $ACCESS_TOKEN" /api/device/me
 */
app.get("/me", async (c) => {
    const db = drizzle(c.env.DB, { schema });
    const token = extractBearerToken(c.req.header("authorization"));

    if (!token) {
        return c.json({ error: "Missing Authorization header" }, 401);
    }

    const result = await validateBearerSession(db, token);

    if (!result) {
        return c.json({ error: "Invalid or expired token" }, 401);
    }

    return c.json({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        image: result.user.image,
        tier: result.user.tier,
        githubUsername: result.user.githubUsername,
    });
});

export const deviceRoutes = app;
