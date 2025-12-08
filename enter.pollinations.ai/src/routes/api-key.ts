import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import { SECRET_KEY_PREFIX } from "../constants.ts";
import { z } from "zod";
import { validator } from "../middleware/validator.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth.ts";

const querySchema = z.object({
    secret: z.string().min(64).max(64),
});

export const apiKeyRoutes = new Hono<Env>()
    .post(
        "/store-redirect-secret",
        describeRoute({
            tags: ["Auth"],
            description: "Store a secret-to-session mapping for secure redirect flow",
            hide: true,
        }),
        async (c) => {
            // This endpoint requires session authentication
            const sessionHeader = c.req.header('cookie');
            if (!sessionHeader?.includes('better-auth.session_token')) {
                throw new HTTPException(401, { message: 'Unauthorized' });
            }

            const body = await c.req.json();
            const { secret, sessionId } = body as { secret: string; sessionId: string };

            if (!secret || !sessionId) {
                throw new HTTPException(400, { message: 'Missing secret or sessionId' });
            }

            // Store in KV with 5 minute expiration
            await c.env.KV.put(`redirect_secret:${secret}`, sessionId, {
                expirationTtl: 300, // 5 minutes
            });

            return c.json({ success: true });
        }
    )
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: [
                "Get an API key using a redirect secret.",
                "This endpoint is used by external apps after redirect to obtain a secret API key.",
                "Requires a secret parameter that was provided during the redirect.",
                "Creates a new secret API key for the user.",
            ].join(" "),
        }),
        validator("query", querySchema),
        async (c) => {
            const { secret } = c.req.valid("query");

            try {
                // Look up the session ID from the secret
                const sessionId = await c.env.KV.get(`redirect_secret:${secret}`);
                
                if (!sessionId) {
                    throw new HTTPException(401, {
                        message: "Invalid or expired secret",
                    });
                }

                // Delete the secret after use (single use)
                await c.env.KV.delete(`redirect_secret:${secret}`);

                // Get the user from the session
                const db = drizzle(c.env.DB, { schema });
                
                const sessionRecord = await db.query.session.findFirst({
                    where: eq(schema.session.id, sessionId),
                });

                if (!sessionRecord) {
                    throw new HTTPException(401, { message: "Session not found or expired" });
                }

                const userId = sessionRecord.userId;

                // Create a new secret API key for this user using better-auth
                const { createAuth } = await import("../auth.ts");
                const auth = createAuth(c.env);
                
                const createResult = await auth.api.createApiKey({
                    body: {
                        userId: userId,
                        name: "Redirect API Key",
                        prefix: SECRET_KEY_PREFIX,
                        metadata: {
                            description: "Created via redirect flow",
                            keyType: "secret",
                        },
                    },
                });

                if (!createResult || !createResult.data) {
                    throw new HTTPException(500, {
                        message: "Failed to create API key",
                    });
                }

                const newKey = createResult.data;

                return c.json({
                    key: newKey.key,
                    keyId: newKey.id,
                    name: newKey.name || "Redirect API Key",
                    type: "secret",
                });
            } catch (e) {
                if (e instanceof HTTPException) throw e;
                throw new HTTPException(500, { cause: e });
            }
        }
    );

export type ApiKeyRoutes = typeof apiKeyRoutes;
