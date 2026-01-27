import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import * as schema from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

/**
 * Build updated permissions object based on changes
 */
function buildUpdatedPermissions(
    existing: Record<string, string[]>,
    allowedModels?: string[] | null,
    accountPermissions?: string[] | null,
): Record<string, string[]> | undefined {
    const updated = { ...existing };
    let hasChanges = false;

    // Handle models: null = remove, array = set
    if (allowedModels === null) {
        delete updated.models;
        hasChanges = true;
    } else if (allowedModels?.length) {
        updated.models = allowedModels;
        hasChanges = true;
    }

    // Handle account: null = remove, array = set
    if (accountPermissions === null) {
        delete updated.account;
        hasChanges = true;
    } else if (accountPermissions?.length) {
        updated.account = accountPermissions;
        hasChanges = true;
    }

    return hasChanges ? updated : undefined;
}

/**
 * Parse potentially double-serialized JSON metadata
 */
function parseMetadata(metadata: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(metadata);
        return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch {
        return null;
    }
}

/**
 * Schema for updating an API key.
 * Uses better-auth's server API which supports server-only fields like permissions.
 *
 * Permissions format: { models?: string[], account?: string[] }
 * - models: ["flux", "openai"] = restrict to specific models
 * - account: ["balance", "usage"] = allow access to account endpoints
 */
const UpdateApiKeySchema = z.object({
    name: z.string().optional().describe("Name for the API key"),
    allowedModels: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Model IDs this key can access. null = all models allowed"),
    pollenBudget: z
        .number()
        .nullable()
        .optional()
        .describe("Pollen budget cap for this key. null = unlimited"),
    accountPermissions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe('Account permissions: ["balance", "usage"]. null = none'),
    expiresAt: z
        .string()
        .datetime()
        .nullable()
        .optional()
        .transform((val) => val ? new Date(val) : val)
        .describe("Expiration date for the key. null = no expiry"),
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
            tags: ["Account"],
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
                    permissions: key.permissions
                        ? (() => {
                              const parsed = JSON.parse(key.permissions);
                              return Object.keys(parsed).length > 0 ? parsed : null;
                          })()
                        : null,
                    metadata: key.metadata ? parseMetadata(key.metadata) : null,
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
            tags: ["Account"],
            description: "Update an API key's permissions and budget.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", UpdateApiKeySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const authClient = c.var.auth.client;
            const { id } = c.req.param();
            const {
                name,
                allowedModels,
                pollenBudget,
                accountPermissions,
                expiresAt,
            } = c.req.valid("json");

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

            // Build updated permissions object
            const existingPermissions = existingKey.permissions
                ? (JSON.parse(existingKey.permissions as string) as Record<
                      string,
                      string[]
                  >)
                : {};

            const updatedPermissions = buildUpdatedPermissions(
                existingPermissions,
                allowedModels,
                accountPermissions,
            );

            // Only update if permissions changed
            if (updatedPermissions !== undefined) {
                await authClient.api.updateApiKey({
                    body: {
                        keyId: id,
                        userId: user.id,
                        permissions: updatedPermissions,
                    },
                });
            }

            // Update D1 columns directly if provided
            const d1Updates: {
                name?: string;
                pollenBalance?: number | null;
                expiresAt?: Date | null;
            } = {};

            if (name !== undefined) d1Updates.name = name;
            if (pollenBudget !== undefined)
                d1Updates.pollenBalance = pollenBudget;
            if (expiresAt !== undefined) d1Updates.expiresAt = expiresAt;

            // Fetch the key first to get the raw key for cache invalidation
            const existingKeyForCache = Object.keys(d1Updates).length > 0
                ? await db.query.apikey.findFirst({
                      where: eq(schema.apikey.id, id),
                  })
                : null;

            if (Object.keys(d1Updates).length > 0) {
                await db
                    .update(schema.apikey)
                    .set(d1Updates)
                    .where(eq(schema.apikey.id, id));

                // Invalidate better-auth's KV cache for this key
                // Better-auth uses "auth:" prefix and might cache by both ID and key value
                const cacheKey = `auth:api-key:${id}`;
                await c.env.KV.delete(cacheKey);

                if (existingKeyForCache?.key) {
                    // Also invalidate cache by the actual key value
                    const keyCacheKey = `auth:api-key:${existingKeyForCache.key}`;
                    await c.env.KV.delete(keyCacheKey);
                }
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
                expiresAt: finalKey?.expiresAt ?? null,
            });
        },
    );
