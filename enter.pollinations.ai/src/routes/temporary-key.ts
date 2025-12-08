import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { describeRoute } from "hono-openapi";
import { auth, type AuthEnv } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

const SECRET_KEY_PREFIX = "sk";

// 6 hours default, max 24 hours
const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60;
const MAX_EXPIRY_SECONDS = 24 * 60 * 60;

const createKeySchema = z.object({
    name: z.string().min(1).max(100),
    expiresIn: z.number().min(60).max(MAX_EXPIRY_SECONDS).optional(),
});

export const temporaryKeyRoutes = new Hono<AuthEnv>()
    // Require session auth (not API key)
    .use("*", auth({ allowApiKey: false, allowSessionCookie: true }))
    .post(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: "Create a temporary API key with expiration for third-party app authorization",
        }),
        validator("json", createKeySchema),
        async (c) => {
            const { name, expiresIn = DEFAULT_EXPIRY_SECONDS } = c.req.valid("json");
            const authCtx = c.get("auth");
            const user = authCtx.requireUser();

            try {
                // Create API key with expiration using better-auth
                const result = await authCtx.client.api.createApiKey({
                    body: {
                        userId: user.id,
                        name,
                        prefix: SECRET_KEY_PREFIX,
                        expiresIn, // seconds until expiration
                        metadata: {
                            keyType: "temporary",
                            createdVia: "redirect-auth",
                        },
                    },
                });

                if (!result || !result.key) {
                    throw new HTTPException(500, { message: "Failed to create API key" });
                }

                return c.json({
                    key: result.key,
                    keyId: result.id,
                    name: result.name,
                    expiresAt: result.expiresAt,
                    expiresIn,
                });
            } catch (e) {
                if (e instanceof HTTPException) throw e;
                console.error("Failed to create temporary key:", e);
                throw new HTTPException(500, { message: "Failed to create temporary key" });
            }
        }
    );

export type TemporaryKeyRoutes = typeof temporaryKeyRoutes;
