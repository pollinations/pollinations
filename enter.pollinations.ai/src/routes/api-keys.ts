import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema/better-auth.ts";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";

/**
 * Schema for updating an API key.
 * Uses better-auth's server API which supports server-only fields like permissions.
 */
const UpdateApiKeySchema = z.object({
    // null = unrestricted (all models), [] or [...models] = restricted
    allowedModels: z.array(z.string()).nullable().optional(),
    // null = unlimited, number = pollen budget cap
    pollenBudget: z.number().nullable().optional(),
});

/**
 * API key management routes.
 * Provides update functionality for server-only fields (permissions, etc.)
 * Key creation uses better-auth's native client API.
 */
export const apiKeysRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /**
     * List all API keys for the current user with pollenBalance from D1.
     * Extends better-auth's native list with custom D1 columns.
     */
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description:
                "List all API keys for the current user with pollenBalance.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });

            const keys = await db.query.apikey.findMany({
                where: eq(schema.apikey.userId, user.id),
                orderBy: (apikey, { desc }) => [desc(apikey.createdAt)],
            });

            return c.json({
                data: keys.map((key) => ({
                    id: key.id,
                    name: key.name,
                    start: key.start,
                    createdAt: key.createdAt,
                    lastRequest: key.lastRequest,
                    expiresAt: key.expiresAt,
                    permissions: key.permissions,
                    metadata: key.metadata,
                    pollenBalance: key.pollenBalance,
                })),
            });
        },
    )
    /**
     * Update an API key's permissions.
     * Uses auth.api.updateApiKey() which supports server-only fields like permissions.
     */
    .post(
        "/:id/update",
        describeRoute({
            tags: ["Auth"],
            description: "Update an API key's permissions (allowed models).",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", UpdateApiKeySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const authClient = c.var.auth.client;
            const { id } = c.req.param();
            const { allowedModels, pollenBudget } = c.req.valid("json");

            // Verify ownership before updating
            const db = drizzle(c.env.DB, { schema });
            const existingKey = await db.query.apikey.findFirst({
                where: and(
                    eq(schema.apikey.id, id),
                    eq(schema.apikey.userId, user.id),
                ),
            });

            if (!existingKey) {
                throw new HTTPException(404, { message: "API key not found" });
            }

            // Build permissions object
            // null = remove restrictions (all models allowed)
            // [] or [...models] = restricted to specific models
            const permissions =
                allowedModels === null
                    ? null
                    : allowedModels && allowedModels.length > 0
                      ? { models: allowedModels }
                      : undefined;

            // Only call better-auth's updateApiKey if we have permission changes
            // (it throws "No values to update" if permissions is undefined)
            if (permissions !== undefined) {
                await authClient.api.updateApiKey({
                    body: {
                        keyId: id,
                        userId: user.id,
                        permissions,
                    },
                });
            }

            // Update pollenBalance directly in D1 if provided
            // null = remove budget (unlimited), number = set budget
            if (pollenBudget !== undefined) {
                await db
                    .update(schema.apikey)
                    .set({
                        pollenBalance: pollenBudget,
                    })
                    .where(eq(schema.apikey.id, id));
            }

            // Fetch updated key to return current state
            const finalKey = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, id),
            });

            return c.json({
                id: finalKey?.id ?? id,
                name: finalKey?.name,
                permissions: finalKey?.permissions,
                pollenBalance: finalKey?.pollenBalance ?? null,
            });
        },
    );
