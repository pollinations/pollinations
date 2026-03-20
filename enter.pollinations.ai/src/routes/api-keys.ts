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
import { parseMetadata } from "./metadata-utils.ts";

/**
 * Build updated permissions object based on changes.
 * Returns undefined if no permission fields were provided.
 */
function buildUpdatedPermissions(
    existing: Record<string, string[]>,
    allowedModels?: string[] | null,
    accountPermissions?: string[] | null,
): Record<string, string[]> | undefined {
    if (allowedModels === undefined && accountPermissions === undefined) {
        return undefined;
    }
    const updated = { ...existing };
    applyPermissionField(updated, "models", allowedModels);
    applyPermissionField(updated, "account", accountPermissions);
    return updated;
}

function applyPermissionField(
    target: Record<string, string[]>,
    key: string,
    value: string[] | null | undefined,
): void {
    if (value === undefined) return;
    if (value === null) {
        delete target[key];
    } else {
        target[key] = value;
    }
}

/**
 * Parse permissions JSON, returning null for empty objects or invalid JSON.
 */
function parsePermissions(raw: string): Record<string, string[]> | null {
    try {
        const parsed = JSON.parse(raw);
        return Object.keys(parsed).length > 0 ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Verify the authenticated user owns the API key, returning the key row.
 * Throws 404 if not found or not owned by the user.
 */
async function requireOwnedKey(
    db: ReturnType<typeof drizzle<typeof schema>>,
    keyId: string,
    userId: string,
) {
    const key = await db.query.apikey.findFirst({
        where: and(
            eq(schema.apikey.id, keyId),
            eq(schema.apikey.userId, userId),
        ),
    });
    if (!key) {
        throw new HTTPException(404, { message: "API key not found" });
    }
    return key;
}

/**
 * Update metadata on an API key row, merging with existing metadata.
 */
async function updateKeyMetadata(
    db: ReturnType<typeof drizzle<typeof schema>>,
    keyId: string,
    metadataPatch: Record<string, unknown>,
    existingRaw: string | null | undefined,
): Promise<Record<string, unknown>> {
    const merged = { ...parseMetadata(existingRaw), ...metadataPatch };
    await db
        .update(schema.apikey)
        .set({ metadata: JSON.stringify(merged), updatedAt: new Date() })
        .where(eq(schema.apikey.id, keyId));
    return merged;
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
        .transform((val) => (val ? new Date(val) : val))
        .describe("Expiration date for the key. null = no expiry"),
});

/**
 * Schema for updating metadata on an API key.
 */
const UpdateMetadataSchema = z.object({
    description: z.string().optional(),
    keyType: z.string().optional(),
    plaintextKey: z.string().optional(),
    appUrl: z
        .string()
        .refine((val) => /^[a-z][a-z0-9+\-.]*:\/\/.+/.test(val), {
            message: "Must be a valid URL with a scheme (e.g. https://...)",
        })
        .optional(),
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
            tags: ["👤 Account"],
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
                        ? parsePermissions(key.permissions)
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
            tags: ["👤 Account"],
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

            const db = drizzle(c.env.DB, { schema });
            const existingKey = await requireOwnedKey(db, id, user.id);

            const existingPermissions = existingKey.permissions
                ? JSON.parse(existingKey.permissions as string)
                : {};

            const updatedPermissions = buildUpdatedPermissions(
                existingPermissions,
                allowedModels,
                accountPermissions,
            );

            if (updatedPermissions) {
                await authClient.api.updateApiKey({
                    body: {
                        keyId: id,
                        userId: user.id,
                        permissions: updatedPermissions,
                    },
                });
            }

            const d1Updates: Record<string, string | number | Date | null> = {};
            if (name !== undefined) d1Updates.name = name;
            if (pollenBudget !== undefined)
                d1Updates.pollenBalance = pollenBudget;
            if (expiresAt !== undefined) d1Updates.expiresAt = expiresAt;

            if (Object.keys(d1Updates).length > 0) {
                await db
                    .update(schema.apikey)
                    .set(d1Updates)
                    .where(eq(schema.apikey.id, id));
            }

            // Always invalidate KV cache on any update
            const keyForCache = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, id),
            });

            await c.env.KV.delete(`auth:api-key:${id}`);

            if (keyForCache?.key) {
                await c.env.KV.delete(`auth:api-key:${keyForCache.key}`);
            }

            return c.json({
                id: keyForCache?.id ?? id,
                name: keyForCache?.name,
                permissions: keyForCache?.permissions,
                pollenBalance: keyForCache?.pollenBalance ?? null,
                expiresAt: keyForCache?.expiresAt ?? null,
            });
        },
    )
    /**
     * Update metadata for an API key directly via DB.
     */
    .post(
        "/:id/metadata",
        describeRoute({
            tags: ["Account"],
            description: "Update metadata for an API key.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", UpdateMetadataSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const metadataUpdate = c.req.valid("json");

            const db = drizzle(c.env.DB, { schema });
            const existingKey = await requireOwnedKey(db, id, user.id);

            // Check for duplicate appUrl across all keys
            if (metadataUpdate.appUrl) {
                const allKeys = await db.query.apikey.findMany();
                const duplicate = allKeys.find((k) => {
                    if (k.id === id) return false;
                    const meta = parseMetadata(k.metadata);
                    return meta.appUrl === metadataUpdate.appUrl;
                });
                if (duplicate) {
                    throw new HTTPException(409, {
                        message: `This URL is already registered. Please use a different URL.`,
                    });
                }
            }

            const metadata = await updateKeyMetadata(
                db,
                id,
                metadataUpdate,
                existingKey.metadata,
            );

            return c.json({ id, metadata });
        },
    );
