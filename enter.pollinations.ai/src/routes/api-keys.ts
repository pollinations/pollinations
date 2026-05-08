import {
    createApiKeyForUser,
    validateRedirectUriFormat,
} from "@shared/auth/api-key-creation.ts";
import { sanitizeAuthorizeAccountPermissions } from "@shared/auth/authorize-config.ts";
import {
    deleteOwnedOAuthClientAndKeys,
    findOwnedOAuthClient,
    normalizeOAuthClient,
    oauthClientKeyMetadata,
    oauthClientToListItem,
    updateOwnedOAuthClient,
} from "@shared/auth/oauth-client.ts";
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
        .describe(
            "Key type: secret (sk_) or publishable. Publishable requests with app metadata create app_ OAuth clients.",
        ),
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
    earningsEnabled: z.boolean().optional(),
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
            const oauthClients = await db.query.oauthClient.findMany({
                where: eq(schema.oauthClient.userId, user.id),
                orderBy: (oauthClient, { desc }) => [
                    desc(oauthClient.createdAt),
                ],
            });

            return c.json({
                data: [
                    ...keys.map((key) => ({
                        id: key.id,
                        name: key.name,
                        start: key.start,
                        createdAt: key.createdAt,
                        lastRequest: key.lastRequest,
                        expiresAt: key.expiresAt,
                        permissions: key.permissions
                            ? parsePermissions(key.permissions)
                            : null,
                        metadata: key.metadata
                            ? parseMetadata(key.metadata)
                            : null,
                        pollenBalance: key.pollenBalance,
                        oauthClientId: key.oauthClientId,
                    })),
                    ...oauthClients.map((client) =>
                        oauthClientToListItem(normalizeOAuthClient(client)),
                    ),
                ],
            });
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            description: "Delete an API key or OAuth app client.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });

            if (await deleteOwnedOAuthClientAndKeys(db, id, user.id)) {
                return c.json({ success: true });
            }

            const existingKey = await requireOwnedKey(db, id, user.id);
            await db
                .delete(schema.apikey)
                .where(eq(schema.apikey.id, existingKey.id));
            return c.json({ success: true });
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
            const oauthClient = await findOwnedOAuthClient(db, id, user.id);
            if (oauthClient) {
                const updated = await updateOwnedOAuthClient({
                    db,
                    id,
                    userId: user.id,
                    name,
                });
                return c.json({
                    id: updated.id,
                    name: updated.name,
                    permissions: null,
                    pollenBalance: null,
                    expiresAt: null,
                });
            }

            const existingKey = await requireOwnedKey(db, id, user.id);

            const existingPermissions = existingKey.permissions
                ? JSON.parse(existingKey.permissions as string)
                : {};

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

            if (metadataUpdate.redirectUris) {
                for (const uri of metadataUpdate.redirectUris) {
                    validateRedirectUriFormat(uri);
                }
            }
            const oauthClient = await findOwnedOAuthClient(db, id, user.id);
            if (oauthClient) {
                const updated = await updateOwnedOAuthClient({
                    db,
                    id,
                    userId: user.id,
                    redirectUris: metadataUpdate.redirectUris,
                    description: metadataUpdate.description,
                    earningsEnabled: metadataUpdate.earningsEnabled,
                });
                return c.json({
                    id,
                    metadata: oauthClientKeyMetadata(updated),
                });
            }

            const existingKey = await requireOwnedKey(db, id, user.id);
            if (
                metadataUpdate.redirectUris !== undefined ||
                metadataUpdate.earningsEnabled !== undefined
            ) {
                throw new HTTPException(400, {
                    message:
                        "App metadata can only be updated on OAuth app clients",
                });
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
