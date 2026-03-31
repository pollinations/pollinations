import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as schema from "@/db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const KV_TTL = 600; // 10 minutes
const DEVICE_CODE_LENGTH = 40;
const USER_CODE_LENGTH = 8;
const DEFAULT_EXPIRES_IN = 1800; // 30 minutes

type DeviceStatus = "pending" | "approved" | "denied";

function isExpired(device: { expiresAt: Date }) {
    return device.expiresAt < new Date();
}

/** Look up a device code by user_code and verify it's pending + not expired. */
async function requirePendingDevice(
    db: ReturnType<typeof drizzle<typeof schema>>,
    userCode: string,
) {
    const device = await db.query.deviceCode.findFirst({
        where: eq(schema.deviceCode.userCode, userCode.toUpperCase()),
    });
    if (!device || device.status !== ("pending" satisfies DeviceStatus)) {
        throw new HTTPException(400, {
            message: "Invalid or already-used device code",
        });
    }
    if (isExpired(device)) {
        throw new HTTPException(400, { message: "Device code expired" });
    }
    return device;
}

/** Generate a cryptographically random alphanumeric string. */
function generateCode(length: number): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Generate an uppercase user-friendly code (letters + digits, no ambiguous chars). */
function generateUserCode(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * Device Authorization Grant (RFC 8628).
 * All endpoints live under /api/device/*.
 *
 * POST /code     — request a device + user code (called by CLI)
 * GET  /info     — device code metadata for the authorize page
 * POST /approve  — called by the browser after user sets key permissions
 * POST /deny     — called by the browser to deny access
 * POST /token    — polled by the CLI to receive the minted API key
 */
export const deviceRoutes = new Hono<Env>()
    .post("/code", async (c) => {
        const body = await c.req
            .json<{
                client_id?: string;
                scope?: string;
            }>()
            .catch(() => ({}) as { client_id?: string; scope?: string });

        const deviceCode = generateCode(DEVICE_CODE_LENGTH);
        const userCode = generateUserCode(USER_CODE_LENGTH);
        const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_IN * 1000);

        const db = drizzle(c.env.DB, { schema });
        await db.insert(schema.deviceCode).values({
            id: crypto.randomUUID(),
            deviceCode,
            userCode,
            status: "pending" satisfies DeviceStatus,
            expiresAt,
            clientId: body.client_id || null,
            scope: body.scope || null,
        });

        const baseUrl = new URL(c.req.url).origin;
        return c.json({
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${baseUrl}/device`,
            verification_uri_complete: `${baseUrl}/device?user_code=${userCode}`,
            expires_in: DEFAULT_EXPIRES_IN,
            interval: 5,
        });
    })
    .get("/info", async (c) => {
        const userCode = c.req.query("user_code");
        if (!userCode) {
            throw new HTTPException(400, { message: "user_code required" });
        }

        const db = drizzle(c.env.DB, { schema });
        const device = await db.query.deviceCode.findFirst({
            where: eq(schema.deviceCode.userCode, userCode.toUpperCase()),
        });

        if (!device) {
            return c.json(
                { error: "invalid_code", error_description: "Invalid code" },
                400,
            );
        }

        if (isExpired(device)) {
            return c.json(
                { error: "expired_token", error_description: "Code expired" },
                400,
            );
        }

        return c.json({
            status: device.status,
            scope: device.scope || "",
            clientId: device.clientId || null,
        });
    })
    .post(
        "/approve",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const body = await c.req.json<{
                userCode: string;
                apiKey: string;
                apiKeyId: string;
                expiresIn?: number;
            }>();

            if (!body.userCode || !body.apiKey || !body.apiKeyId) {
                throw new HTTPException(400, {
                    message: "userCode, apiKey, and apiKeyId are required",
                });
            }

            const db = drizzle(c.env.DB, { schema });
            const device = await requirePendingDevice(db, body.userCode);

            // KV store and D1 update are independent — run concurrently
            await Promise.all([
                c.env.KV.put(
                    `device-key:${device.deviceCode}`,
                    JSON.stringify({
                        key: body.apiKey,
                        expiresIn: body.expiresIn ?? null,
                    }),
                    { expirationTtl: KV_TTL },
                ),
                db
                    .update(schema.deviceCode)
                    .set({
                        status: "approved" satisfies DeviceStatus,
                        userId: user.id,
                    })
                    .where(eq(schema.deviceCode.id, device.id)),
            ]);

            return c.json({ success: true });
        },
    )
    .post(
        "/deny",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        async (c) => {
            const body = await c.req.json<{ userCode: string }>();

            if (!body.userCode) {
                throw new HTTPException(400, {
                    message: "userCode is required",
                });
            }

            const db = drizzle(c.env.DB, { schema });
            const device = await requirePendingDevice(db, body.userCode);

            await db
                .update(schema.deviceCode)
                .set({ status: "denied" satisfies DeviceStatus })
                .where(eq(schema.deviceCode.id, device.id));

            return c.json({ success: true });
        },
    )
    .post("/token", async (c) => {
        const body = await c.req.json<{
            device_code: string;
            client_id?: string;
            grant_type?: string;
        }>();

        if (!body.device_code) {
            return c.json(
                {
                    error: "invalid_request",
                    error_description: "device_code required",
                },
                400,
            );
        }

        const db = drizzle(c.env.DB, { schema });
        const device = await db.query.deviceCode.findFirst({
            where: eq(schema.deviceCode.deviceCode, body.device_code),
        });

        if (!device) {
            return c.json(
                {
                    error: "invalid_grant",
                    error_description: "Unknown device code",
                },
                400,
            );
        }

        if (isExpired(device)) {
            return c.json({ error: "expired_token" }, 400);
        }

        // Validate client_id matches what was used during code issuance (when provided)
        if (
            device.clientId &&
            body.client_id &&
            body.client_id !== device.clientId
        ) {
            return c.json(
                {
                    error: "invalid_client",
                    error_description: "client_id mismatch",
                },
                400,
            );
        }

        switch (device.status) {
            case "pending" satisfies DeviceStatus:
                return c.json({ error: "authorization_pending" }, 400);

            case "denied" satisfies DeviceStatus:
                return c.json({ error: "access_denied" }, 400);

            case "approved" satisfies DeviceStatus: {
                const stored = (await c.env.KV.get(
                    `device-key:${device.deviceCode}`,
                    "json",
                )) as { key: string; expiresIn: number | null } | null;

                if (!stored) {
                    return c.json({ error: "authorization_pending" }, 400);
                }

                // Delete device code row and KV entry concurrently
                await Promise.all([
                    db
                        .delete(schema.deviceCode)
                        .where(eq(schema.deviceCode.id, device.id)),
                    c.env.KV.delete(`device-key:${device.deviceCode}`),
                ]);

                return c.json({
                    access_token: stored.key,
                    token_type: "bearer",
                    ...(stored.expiresIn != null && {
                        expires_in: stored.expiresIn,
                    }),
                    ...(device.scope && { scope: device.scope }),
                });
            }

            default:
                return c.json({ error: "access_denied" }, 400);
        }
    })
    .get(
        "/userinfo",
        auth({ allowApiKey: true, allowSessionCookie: true }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            const row = await db.query.user.findFirst({
                where: eq(schema.user.id, user.id),
                columns: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    githubUsername: true,
                },
            });
            if (!row) {
                throw new HTTPException(404, { message: "User not found" });
            }
            return c.json({
                sub: row.id,
                name: row.name,
                email: row.email,
                picture: row.image,
                preferred_username: row.githubUsername,
            });
        },
    );
