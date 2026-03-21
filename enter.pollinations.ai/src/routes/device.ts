import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as schema from "@/db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const KV_TTL = 600; // 10 minutes

/**
 * Device Authorization endpoints.
 *
 * POST /approve  — called by the browser after user sets key permissions
 * POST /token    — polled by the CLI to receive the minted API key
 * GET  /info     — returns device code info (scope, client_id) for the authorize page
 */
export const deviceRoutes = new Hono<Env>()
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

        if (device.expiresAt < new Date()) {
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
            const device = await db.query.deviceCode.findFirst({
                where: eq(
                    schema.deviceCode.userCode,
                    body.userCode.toUpperCase(),
                ),
            });

            if (!device || device.status !== "pending") {
                throw new HTTPException(400, {
                    message: "Invalid or already-used device code",
                });
            }

            if (device.expiresAt < new Date()) {
                throw new HTTPException(400, {
                    message: "Device code expired",
                });
            }

            // Store the API key in KV for the CLI to poll
            await c.env.KV.put(
                `device-key:${device.deviceCode}`,
                JSON.stringify({
                    key: body.apiKey,
                    expiresIn: body.expiresIn ?? null,
                }),
                { expirationTtl: KV_TTL },
            );

            // Mark device code as approved with the user ID
            await db
                .update(schema.deviceCode)
                .set({ status: "approved", userId: user.id })
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

        // Check expiry
        if (device.expiresAt < new Date()) {
            return c.json({ error: "expired_token" }, 400);
        }

        // Enforce polling interval
        if (device.lastPolledAt && device.pollingInterval) {
            const elapsed = (Date.now() - device.lastPolledAt.getTime()) / 1000;
            if (elapsed < device.pollingInterval) {
                return c.json({ error: "slow_down" }, 400);
            }
        }

        // Update lastPolledAt
        await db
            .update(schema.deviceCode)
            .set({ lastPolledAt: new Date() })
            .where(eq(schema.deviceCode.id, device.id));

        switch (device.status) {
            case "pending":
                return c.json({ error: "authorization_pending" }, 400);

            case "denied":
                return c.json({ error: "access_denied" }, 400);

            case "approved": {
                // Read the stored API key from KV
                const stored = (await c.env.KV.get(
                    `device-key:${device.deviceCode}`,
                    "json",
                )) as { key: string; expiresIn: number | null } | null;

                if (!stored) {
                    // Key expired from KV or not yet stored — treat as pending
                    return c.json({ error: "authorization_pending" }, 400);
                }

                // Mark as completed so the key can't be retrieved again
                await db
                    .update(schema.deviceCode)
                    .set({ status: "completed" })
                    .where(eq(schema.deviceCode.id, device.id));

                // Clean up KV
                await c.env.KV.delete(`device-key:${device.deviceCode}`);

                return c.json({
                    access_token: stored.key,
                    token_type: "bearer",
                    ...(stored.expiresIn != null && {
                        expires_in: stored.expiresIn,
                    }),
                });
            }

            default:
                // "completed" or any other status
                return c.json({ error: "access_denied" }, 400);
        }
    });
