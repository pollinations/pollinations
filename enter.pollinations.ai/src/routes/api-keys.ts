import {
    createApiKeyForUser,
    validateRedirectUriFormat,
} from "@shared/auth/api-key-creation.ts";
import { sanitizeAuthorizeAccountPermissions } from "@shared/auth/authorize-config.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { parseMetadata } from "./metadata-utils.ts";
import {
    readOrganizationIdParam,
    requireManageApiKeysPermission,
    requireOrgAccess,
} from "./organizations.ts";

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
 * Verify the authenticated user may manage the API key, returning the key
 * row. For a personally-owned key, that means `userId` created it. For an
 * org-owned key (`apikey.organizationId` set), it means the caller is the
 * org's owner or a member with `canManageApiKeys` — not necessarily the
 * member who created the key. Throws 404 if the key doesn't exist or the
 * caller has no relationship to it.
 */
async function requireOwnedKey(
    db: ReturnType<typeof drizzle<typeof schema>>,
    keyId: string,
    userId: string,
) {
    const key = await db.query.apikey.findFirst({
        where: eq(schema.apikey.id, keyId),
    });
    if (!key) {
        throw new HTTPException(404, { message: "API key not found" });
    }
    if (key.organizationId) {
        const { role, membership } = await requireOrgAccess(
            db,
            key.organizationId,
            userId,
        );
        requireManageApiKeysPermission(role, membership);
        return key;
    }
    if (key.userId !== userId) {
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
    organizationId: z
        .string()
        .optional()
        .describe(
            "Create this key as org-owned: it spends the organization's paid Pollen balance instead of the creator's own. Caller must be the org's owner or a member with canManageApiKeys.",
        ),
});

/**
 * Schema for updating metadata on an API key.
 * Only caller-owned fields are accepted. Server-controlled fields like
 * keyType, createdVia, and plaintextKey cannot be modified after creation.
 */
const UrlWithSchemeSchema = z.string().refine(
    (val) => {
        try {
            validateRedirectUriFormat(val);
            return true;
        } catch {
            return false;
        }
    },
    {
        message:
            "Must be an https:// redirect URI with no fragment, or http:// on a loopback host",
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

            if (input.organizationId) {
                const db = drizzle(c.env.DB, { schema });
                const { role, membership } = await requireOrgAccess(
                    db,
                    input.organizationId,
                    user.id,
                );
                requireManageApiKeysPermission(role, membership);
            }

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
                organizationId: input.organizationId,
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

            const organizationId = readOrganizationIdParam(c);
            if (organizationId) {
                // Any member (including read-only) may view the org's key
                // list — just not create/manage them.
                await requireOrgAccess(db, organizationId, user.id);
            }

            const keys = await db.query.apikey.findMany({
                where: organizationId
                    ? eq(schema.apikey.organizationId, organizationId)
                    : eq(schema.apikey.userId, user.id),
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
                    byopClientKeyId: key.byopClientKeyId,
                    organizationId: key.organizationId,
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
                if (existingKey.organizationId) {
                    // Better-auth's native updateApiKey requires the key's
                    // stored userId to equal the caller's session id — that
                    // only holds for the member who created the key, not an
                    // org manager updating someone else's key. Write the
                    // permissions column directly instead, same as the other
                    // D1-only fields below.
                    await db
                        .update(schema.apikey)
                        .set({
                            permissions: JSON.stringify(updatedPermissions),
                        })
                        .where(eq(schema.apikey.id, id));
                } else {
                    await authClient.api.updateApiKey({
                        body: {
                            keyId: id,
                            userId: user.id,
                            permissions: updatedPermissions,
                        },
                    });
                }
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
            tags: ["👤 Account"],
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
            if (
                metadataUpdate.earningsEnabled !== undefined &&
                existingKey.prefix !== "pk"
            ) {
                throw new HTTPException(400, {
                    message:
                        "BYOP earnings can only be enabled on publishable app keys",
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
    )
    /**
     * Delete an API key. First-party route (not better-auth's native
     * `authClient.apiKey.delete`, which requires `apikey.userId` to match the
     * caller's session and so can't authorize an org manager deleting a key
     * created by a different member).
     */
    .post(
        "/:id/delete",
        describeRoute({
            tags: ["👤 Account"],
            description: "Delete an API key.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireOwnedKey(db, id, user.id);
            await db.delete(schema.apikey).where(eq(schema.apikey.id, id));
            return c.json({ id });
        },
    );
