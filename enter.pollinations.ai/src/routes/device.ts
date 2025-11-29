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

        // Create session for the user
        // We need to manually create a session using better-auth or insert into DB
        // Using better-auth internal API if possible, or manual insertion
        // Better-auth doesn't expose "createSession" easily in the public API without a request context usually.
        // But we can use the database adapter directly or try to construct a session.

        // Let's use the database to create a session manually for now as it's cleaner than faking a request.
        // Or better, use auth.api.createSession if available?
        // Checking auth.ts... it returns `betterAuth(...)`.

        // Let's try to use the internal db adapter or just insert into session table.
        // Inserting into session table is safe if we generate a valid token.

        const token = crypto.randomUUID(); // Session token
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

        // We need to import 'session' table from schema
        const { session } = await import("../db/schema/better-auth");

        await db.insert(session).values({
            id: crypto.randomUUID(),
            userId: record.userId,
            token,
            expiresAt,
            createdAt: new Date(),
            updatedAt: new Date(),
            userAgent: c.req.header("User-Agent"),
            ipAddress: c.req.header("CF-Connecting-IP"),
        });

        // Cleanup verification record
        await db
            .delete(deviceVerification)
            .where(eq(deviceVerification.id, record.id));

        return c.json({
            access_token: token,
            token_type: "Bearer",
            expires_in: 30 * 24 * 60 * 60,
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
