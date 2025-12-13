import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { createAuth } from "../auth.ts";

const UpdatePermissionsSchema = z.object({
    keyId: z.string(),
    permissions: z
        .object({
            models: z.array(z.string()).optional(),
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

            // Use better-auth's server API to update permissions
            const authInstance = createAuth(c.env);
            await authInstance.api.updateApiKey({
                body: {
                    keyId,
                    userId: user.id, // Ensures only owner can update
                    permissions,
                },
            });

            return c.json({ success: true });
        },
    );
