import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { createAuth } from "../auth.ts";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema/better-auth.ts";
import { eq } from "drizzle-orm";

const UpdatePermissionsSchema = z.object({
    keyId: z.string(),
    permissions: z
        .object({
            // Filter out internal markers like "_restricted"
            models: z
                .array(z.string())
                .transform((models) =>
                    models.filter((m) => !m.startsWith("_")),
                ),
        })
        .nullable(),
});

/**
 * API key management routes.
 * Provides server-side operations that the client API doesn't support.
 */
export const apiKeysRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /**
     * Update API key permissions.
     * Uses better-auth's server API which supports permissions.
     */
    .post(
        "/permissions",
        validator("json", UpdatePermissionsSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { keyId, permissions } = c.req.valid("json");

            // Verify ownership: check the key belongs to this user
            // Direct DB lookup is simpler than better-auth's getApiKey which requires headers
            const db = drizzle(c.env.DB, { schema });
            const existingKey = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, keyId),
                columns: { userId: true },
            });
            if (!existingKey || existingKey.userId !== user.id) {
                throw new HTTPException(403, {
                    message: "Not authorized to update this API key",
                });
            }

            // Update permissions via better-auth server API
            const authInstance = createAuth(c.env);
            await authInstance.api.updateApiKey({
                body: {
                    keyId,
                    permissions,
                },
            });

            return c.json({ success: true });
        },
    );
