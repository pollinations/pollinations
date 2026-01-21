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
 * Parse metadata that may be double-serialized by better-auth.
 * Handles both: '{"key":"value"}' and '"{\\"key\\":\\"value\\"}"'
 */
function parseMetadata(metadata: string): Record<string, unknown> | null {
    try {
        let parsed = JSON.parse(metadata);
        if (typeof parsed === "string") {
            parsed = JSON.parse(parsed);
        }
        return parsed;
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
    enabled: z
        .boolean()
        .optional()
        .describe("Whether the key is enabled. false = disabled"),
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
                        ? JSON.parse(key.permissions)
                        : null,
                    metadata: key.metadata ? parseMetadata(key.metadata) : null,
                    pollenBalance: key.pollenBalance,
                    enabled: key.enabled ?? true,
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
            const { allowedModels, pollenBudget, accountPermissions, enabled } =
                c.req.valid("json");

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
            // Format: { models?: string[], account?: string[] }
            const existingPermissions =
                (existingKey.permissions as Record<string, string[]> | null) ??
                {};
            let newPermissions: Record<string, string[]> | null | undefined;

            // Handle allowedModels: null = remove, [...] = set
            if (allowedModels === null) {
                newPermissions = { ...existingPermissions };
                delete newPermissions.models;
            } else if (allowedModels && allowedModels.length > 0) {
                newPermissions = {
                    ...existingPermissions,
                    models: allowedModels,
                };
            }

            // Handle accountPermissions: null = remove, [...] = set
            if (accountPermissions === null) {
                newPermissions = newPermissions ?? { ...existingPermissions };
                delete newPermissions.account;
            } else if (accountPermissions && accountPermissions.length > 0) {
                newPermissions = newPermissions ?? { ...existingPermissions };
                newPermissions.account = accountPermissions;
            }

            // Only call better-auth's updateApiKey if we have permission changes
            // (it throws "No values to update" if permissions is undefined)
            if (newPermissions !== undefined) {
                await authClient.api.updateApiKey({
                    body: {
                        keyId: id,
                        userId: user.id,
                        permissions: newPermissions,
                    },
                });
            }

            // Update D1 columns directly if provided
            const d1Updates: { pollenBalance?: number | null; enabled?: boolean } = {};
            if (pollenBudget !== undefined) d1Updates.pollenBalance = pollenBudget;
            if (enabled !== undefined) d1Updates.enabled = enabled;

            if (Object.keys(d1Updates).length > 0) {
                await db
                    .update(schema.apikey)
                    .set(d1Updates)
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
                enabled: finalKey?.enabled ?? true,
            });
        },
    );
