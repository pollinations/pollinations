import { verifyGrantAgent } from "@shared/auth/agent-run-token.ts";
import {
    createApiKeyForUser,
    validateRedirectUriFormat,
} from "@shared/auth/api-key-creation.ts";
import { parseMetadata } from "@shared/auth/api-key-metadata.ts";
import {
    CONSENT_PERMISSIONS,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { toModelCategories } from "@shared/registry/model-permissions.ts";
import { MODEL_CATEGORIES } from "@shared/registry/registry.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { checkQuestsForUser } from "../services/quest-checker.ts";
import { ACCOUNT_SETUP_QUEST_GROUP } from "../services/quests/index.ts";

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
            eq(schema.apikey.referenceId, userId),
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
 * - models: model categories (text, image, ...) = restrict to those categories
 * - account: ["profile", "usage", "keys", "machines"] = allow access to account endpoints and hosted sandboxes
 */
const UpdateApiKeySchema = z.object({
    name: z.string().optional().describe("Name for the API key"),
    allowedModels: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            "Model categories this key can use: text, image, video, audio, 3d, embedding, realtime. A model ID from /models allows its whole category. null = all models allowed",
        ),
    pollenBudget: z
        .number()
        .nullable()
        .optional()
        .describe("Pollen budget cap for this key. null = unlimited"),
    questPollenOnly: z
        .boolean()
        .optional()
        .describe(
            "Spend only Quest Pollen, never paid Pollen. Requests stop when Quest Pollen runs out",
        ),
    accountPermissions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            'Account permissions: ["profile", "usage", "keys", "machines"]. null = none',
        ),
    expiresAt: z
        .string()
        .datetime()
        .nullable()
        .optional()
        .transform((val) => (val ? new Date(val) : val))
        .describe("Expiration date for the key. null = no expiry"),
});

// One model category or one account permission per approval.
const GrantSchema = z.union([
    z.object({ category: z.enum(MODEL_CATEGORIES) }),
    z.object({ permission: z.enum(CONSENT_PERMISSIONS) }),
]);

// A grant link from an agent run names the agent, signed by gen.
const GrantAgentSchema = z.intersection(
    GrantSchema,
    z.object({ agent: z.string().min(1), sig: z.string().min(1) }),
);

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
        .refine(
            (seconds) =>
                Number.isFinite(
                    new Date(Date.now() + seconds * 1000).getTime(),
                ),
            "Expiry is outside the supported date range",
        )
        .optional()
        .describe("Expiry in seconds from now"),
    allowedModels: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            "Model categories this key can use: text, image, video, audio, 3d, embedding, realtime. A model ID from /models allows its whole category. null = all models allowed",
        ),
    pollenBudget: z
        .number()
        .nullable()
        .optional()
        .describe(
            "Pollen budget cap. Publishable keys accept only null, omission, or 0 and always use 0; secret keys use null for unlimited",
        ),
    questPollenOnly: z
        .boolean()
        .optional()
        .describe(
            "Spend only Quest Pollen, never paid Pollen. Requests stop when Quest Pollen runs out",
        ),
    accountPermissions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            'Account permissions: ["profile", "usage", "keys", "machines"]. null = none',
        ),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for updating metadata on an API key.
 * Only caller-owned fields are accepted. Server-controlled fields like
 * keyType, createdVia, and plaintextKey cannot be modified after creation.
 * redirectUris stay plain strings here; the handler calls
 * validateRedirectUriFormat so the precise error message is returned.
 */
const UpdateMetadataSchema = z.object({
    description: z.string().optional(),
    redirectUris: z.array(z.string()).optional(),
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
                questPollenOnly: input.questPollenOnly,
                accountPermissions: input.accountPermissions,
                metadata: input.metadata,
                defaultCreatedVia: createdVia,
            });

            c.executionCtx.waitUntil(
                checkQuestsForUser(c.env, user.id, [
                    ACCOUNT_SETUP_QUEST_GROUP,
                ]).catch((error) =>
                    c.get("log").warn("API key quest check failed: {error}", {
                        error,
                    }),
                ),
            );

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
                where: eq(schema.apikey.referenceId, user.id),
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
                    questPollenOnly: key.questPollenOnly,
                    byopClientKeyId: key.byopClientKeyId,
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
                questPollenOnly,
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
                Array.isArray(allowedModels)
                    ? await toModelCategories(c.env.DB, allowedModels)
                    : allowedModels,
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

            const d1Updates: Record<
                string,
                string | number | boolean | Date | null
            > = {};
            if (name !== undefined) d1Updates.name = name;
            if (pollenBudget !== undefined)
                d1Updates.pollenBalance = pollenBudget;
            if (questPollenOnly !== undefined)
                d1Updates.questPollenOnly = questPollenOnly;
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
                questPollenOnly: updated?.questPollenOnly ?? false,
                expiresAt: updated?.expiresAt ?? null,
            });
        },
    )
    .post(
        "/:id/grant",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Add one model category or account permission to an owned API key.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", GrantSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const grant = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            const key = await requireOwnedKey(db, id, user.id);
            const permissions = key.permissions
                ? parsePermissions(key.permissions)
                : null;

            // Only the granted entry changes; budget, expiry and the rest stay.
            let next: Record<string, string[]> | null = null;
            if ("permission" in grant) {
                const account = permissions?.account ?? [];
                if (!account.includes(grant.permission)) {
                    next = {
                        ...permissions,
                        account: [...account, grant.permission],
                    };
                }
            } else {
                // An absent model list already allows every category. Keep it.
                const models = permissions?.models;
                if (Array.isArray(models) && !models.includes(grant.category)) {
                    next = {
                        ...permissions,
                        models: [...models, grant.category],
                    };
                }
            }
            if (next) {
                await c.var.auth.client.api.updateApiKey({
                    body: { keyId: id, userId: user.id, permissions: next },
                });
            }
            return c.json({ granted: true });
        },
    )
    .get(
        "/:id/grant-agent",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Confirm which agent a grant link says asked for the grant.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", GrantAgentSchema),
        async (c) => {
            c.var.auth.requireUser();
            const query = c.req.valid("query");
            const grant =
                "category" in query
                    ? { category: query.category }
                    : { permission: query.permission };
            // The link reached the owner through the agent, so only gen's
            // signature makes the name trustworthy. This reads nothing from
            // the key, so it needs no ownership check.
            const signed = verifyGrantAgent({
                secret: c.env.BETTER_AUTH_SECRET,
                apiKeyId: c.req.param("id"),
                grant,
                agent: query.agent,
                sig: query.sig,
            });
            return c.json({ agent: signed ? query.agent : null });
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
    );
