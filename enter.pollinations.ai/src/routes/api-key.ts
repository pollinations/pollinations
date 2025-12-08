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
                
                // Create API key by directly calling the database since we have the userId
                     // Generate key using same logic as auth.ts
                     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                     const randomBytes = crypto.getRandomValues(new Uint8Array(32));
                     const keyValue = Array.from(randomBytes, (byte) => chars[byte % chars.length]).join("");
                     const fullKey = `${SECRET_KEY_PREFIX}_${keyValue}`;
                     const now = new Date();

                     const apiKeyRecord = await db.insert(schema.apikey).values({
                    id: crypto.randomUUID(),
                    userId: userId,
                          key: fullKey,
                          prefix: SECRET_KEY_PREFIX,
                    name: "Redirect API Key",
                          metadata: JSON.stringify({
                        description: "Created via redirect flow",
                        keyType: "secret",
                          }),
                          createdAt: now,
                          updatedAt: now,
                          enabled: true,
                          rateLimitEnabled: true,
                }).returning().get();

                if (!apiKeyRecord) {
                    throw new HTTPException(500, {
                        message: "Failed to create API key",
                    });
                }

                return c.json({
                    key: apiKeyRecord.key,
                    keyId: apiKeyRecord.id,
                    name: apiKeyRecord.name || "Redirect API Key",
                    type: "secret",
                });
            } catch (e) {
                if (e instanceof HTTPException) throw e;
                throw new HTTPException(500, { cause: e });
            }
        }
    );

export type ApiKeyRoutes = typeof apiKeyRoutes;
