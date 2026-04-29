import {
    createApiKeyForUser,
    validateRedirectUriFormat,
} from "@shared/auth/api-key-creation.ts";
import { sanitizeAuthorizeAccountPermissions } from "@shared/auth/authorize-config.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import { parseMetadata } from "./metadata-utils.ts";

const SECONDS_PER_DAY = 24 * 60 * 60;

function setPrivateNoStoreHeaders(c: {
    header: (name: string, value: string) => void;
}): void {
    c.header("Cache-Control", "private, no-store, max-age=0");
    c.header("Pragma", "no-cache");
}

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
 * - account: ["profile", "usage", "keys"] = allow access to account endpoints
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
        .describe(
            'Account permissions: ["profile", "usage", "keys"]. null = none',
        ),
    expiresAt: z
        .string()
        .datetime()
        .nullable()
        .optional()
        .transform((val) => (val ? new Date(val) : val))
        .describe("Expiration date for the key. null = no expiry"),
});

const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(253).describe("Name for the API key"),
    type: z
        .enum(["secret", "publishable"])
        .optional()
        .default("secret")
        .describe("Key type: secret (sk_) or publishable (pk_)"),
    expiresIn: z
        .number()
        .int()
        .positive()
        .max(365 * SECONDS_PER_DAY)
        .optional()
        .describe("Expiry in seconds from now (max 365 days)"),
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
        .describe(
            'Account permissions: ["profile", "usage", "keys"]. null = none',
        ),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for updating metadata on an API key.
 * Only caller-owned fields are accepted. Server-controlled fields like
 * keyType, createdVia, and plaintextKey cannot be modified after creation.
 */
const UrlWithSchemeSchema = z.string().refine(
    (val) => {
        if (!/^[a-z][a-z0-9+\-.]*:\/\/.+/.test(val)) return false;
        try {
            return new URL(val).hash === "";
        } catch {
            return false;
        }
    },
    {
        message:
            "Must be a valid URL with a scheme and no fragment (e.g. https://...)",
    },
);

const UpdateMetadataSchema = z.object({
    description: z.string().optional(),
    redirectUris: z.array(UrlWithSchemeSchema).optional(),
});

/**
 * API key management routes.
 * Provides update functionality for server-only fields (permissions, etc.)
 * Key creation uses better-auth's native client API.
 */
export const apiKeysRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /**
     * Create an API key for the authenticated dashboard/BYOP session.
     * Centralizes key creation so validation happens before Better Auth creates
     * the key, avoiding the old create-then-metadata-update flow.
     */
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            description: "Create an API key for the current session user.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", CreateApiKeySchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const createdVia =
                typeof input.metadata?.redirectUri === "string" ||
                typeof input.metadata?.deviceUserCode === "string"
                    ? "redirect-auth"
                    : "dashboard";

            const created = await createApiKeyForUser({
                authClient: c.var.auth.client,
                dbBinding: c.env.DB,
                userId: user.id,
                name: input.name,
                type: input.type,
                expiresIn: input.expiresIn,
                allowedModels: input.allowedModels,
                pollenBudget: input.pollenBudget,
                accountPermissions: input.accountPermissions,
                metadata: input.metadata,
                allowAccountKeysPermission: true,
                defaultCreatedVia: createdVia,
            });

            return c.json(created);
        },
    )
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
            setPrivateNoStoreHeaders(c);

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

            const existingPermissions =
                parsePermissions(existingKey.permissions as string) ?? {};

            // Whitelist to known scopes (drops unknown / legacy names like "balance").
            // Dashboard-only endpoint, so "keys" is allowed here.
            const sanitizedAccountPerms =
                accountPermissions === undefined
                    ? undefined
                    : sanitizeAuthorizeAccountPermissions(accountPermissions);

            const updatedPermissions = buildUpdatedPermissions(
                existingPermissions,
                allowedModels,
                sanitizedAccountPerms,
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

            const updated = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, id),
            });

            return c.json({
                id: updated?.id ?? id,
                name: updated?.name,
                permissions: updated?.permissions,
                pollenBalance: updated?.pollenBalance ?? null,
                expiresAt: updated?.expiresAt ?? null,
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

            if (metadataUpdate.redirectUris) {
                for (const uri of metadataUpdate.redirectUris) {
                    validateRedirectUriFormat(uri);
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
    )
    /**
     * Rotate an API key: creates a new key with the same settings, then deletes the old one.
     * Returns the new plaintext key (shown once, like creation).
     */
    .post(
        "/:id/rotate",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Rotate an API key. Creates a new key with identical settings, deletes the old one.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const authClient = c.var.auth.client;
            const { id } = c.req.param();

            const db = drizzle(c.env.DB, { schema });
            const existingKey = await requireOwnedKey(db, id, user.id);

            // Parse existing metadata and permissions
            const existingMeta = existingKey.metadata
                ? parseMetadata(existingKey.metadata)
                : {};
            const existingPermissions =
                parsePermissions(existingKey.permissions as string) ?? {};

            const keyType =
                (existingMeta.keyType as string) ||
                (existingKey.prefix === "pk" ? "publishable" : "secret");
            const isPublishable = keyType === "publishable";
            const prefix = isPublishable ? "pk" : "sk";

            // Step 1: Create new key
            const createResult = await authClient.api.createApiKey({
                body: { name: existingKey.name || "rotated-key", prefix },
                headers: c.req.raw.headers,
            });

            if (!createResult?.key) {
                throw new HTTPException(500, {
                    message: "Failed to create replacement key",
                });
            }

            const newKeyId = createResult.id;
            const newPlaintextKey = createResult.key;

            // Step 2: Copy over metadata
            const metadataPatch: Record<string, unknown> = { ...existingMeta };
            if (isPublishable) {
                metadataPatch.plaintextKey = newPlaintextKey;
            }
            await updateKeyMetadata(db, newKeyId, metadataPatch, null);

            // Step 3: Copy permissions, budget, expiry, prefix, and preserve createdAt
            const d1Updates: Record<string, unknown> = {
                createdAt: existingKey.createdAt,
                prefix,
            };
            if (existingKey.pollenBalance !== null) {
                d1Updates.pollenBalance = existingKey.pollenBalance;
            }
            if (existingKey.expiresAt) {
                d1Updates.expiresAt = existingKey.expiresAt;
            }
            await db
                .update(schema.apikey)
                .set(d1Updates)
                .where(eq(schema.apikey.id, newKeyId));

            if (Object.keys(existingPermissions).length > 0) {
                await authClient.api.updateApiKey({
                    body: {
                        keyId: newKeyId,
                        userId: user.id,
                        permissions: existingPermissions,
                    },
                });
            }

            // Step 4: Invalidate KV cache for both old and new keys
            // New key was modified directly in D1 after creation, so its cache is stale
            const newKeyRow = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, newKeyId),
            });
            await c.env.KV.delete(`auth:api-key:${newKeyId}`);
            if (newKeyRow?.key) {
                await c.env.KV.delete(`auth:api-key:${newKeyRow.key}`);
            }

            // Step 5: Delete old key (non-fatal — user still gets the new key)
            let oldKeyDeleted = true;
            try {
                await authClient.api.deleteApiKey({
                    body: { keyId: id },
                    headers: c.req.raw.headers,
                });
            } catch {
                oldKeyDeleted = false;
            }

            // Invalidate KV cache for old key
            await c.env.KV.delete(`auth:api-key:${id}`);
            if (existingKey.key) {
                await c.env.KV.delete(`auth:api-key:${existingKey.key}`);
            }

            return c.json({
                id: newKeyId,
                key: newPlaintextKey,
                name: existingKey.name,
                ...(oldKeyDeleted
                    ? {}
                    : {
                          warning:
                              "Old key could not be deleted. Please delete it manually.",
                      }),
            });
        },
    );
