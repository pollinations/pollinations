import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema/better-auth.ts";
import { eq } from "drizzle-orm";

/**
 * Schema for creating an API key with permissions.
 * Uses better-auth's server API which supports setting permissions at creation time.
 */
const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    keyType: z.enum(["secret", "publishable"]).default("secret"),
    // null = unrestricted (all models), [] or [...models] = restricted
    allowedModels: z.array(z.string()).nullable().optional(),
});

/**
 * API key management routes.
 * Uses better-auth's server API to create keys with permissions in a single call.
 */
export const apiKeysRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /**
     * Create an API key with optional model permissions.
     * Uses auth.api.createApiKey() which supports server-only fields like permissions.
     */
    .post("/create", validator("json", CreateApiKeySchema), async (c) => {
        const user = c.var.auth.requireUser();
        const authClient = c.var.auth.client;
        const { name, description, keyType, allowedModels } =
            c.req.valid("json");

        const isPublishable = keyType === "publishable";
        const prefix = isPublishable ? "plln_pk" : "plln_sk";

        // Build permissions object if models are specified
        const permissions =
            allowedModels && allowedModels.length > 0
                ? { models: allowedModels }
                : undefined;

        // Use better-auth's server API to create key with permissions in one call
        const apiKey = await authClient.api.createApiKey({
            body: {
                name,
                prefix,
                userId: user.id,
                metadata: { description, keyType },
                permissions,
            },
        });

        // Store keySuffix (last 4 chars) for all keys, plus plaintextKey for publishable keys
        if (apiKey.key) {
            const keySuffix = apiKey.key.slice(-4);
            const db = drizzle(c.env.DB, { schema });
            await db
                .update(schema.apikey)
                .set({
                    metadata: JSON.stringify({
                        description,
                        keyType,
                        keySuffix,
                        ...(isPublishable && { plaintextKey: apiKey.key }),
                    }),
                })
                .where(eq(schema.apikey.id, apiKey.id));
        }

        return c.json({
            id: apiKey.id,
            key: apiKey.key,
            name: apiKey.name,
        });
    });
