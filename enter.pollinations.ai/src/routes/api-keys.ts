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
});

/**
 * Schema for updating Turnstile settings on an API key.
 */
const TurnstileSettingsSchema = z.object({
    enabled: z.boolean(),
    hostnames: z.array(z.string().min(1)).default([]),
});

/**
 * Schema for updating metadata on an API key.
 * Used to bypass better-auth's buggy serializeApiKey which corrupts string metadata.
 */
const UpdateMetadataSchema = z.object({
    description: z.string().optional(),
    keyType: z.string().optional(),
    plaintextKey: z.string().optional(),
});

/**
 * API key management routes.
 * Provides update functionality for server-only fields (permissions, etc.)
 * Key creation uses better-auth's native client API.
 */
export const apiKeysRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /**
     * List all API keys for the current user with properly parsed metadata.
     * Returns all data in one call, bypassing better-auth's buggy metadata handling.
     */
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description:
                "List all API keys with full metadata including turnstile settings.",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });

            const keys = await db.query.apikey.findMany({
                where: eq(schema.apikey.userId, user.id),
                orderBy: (apikey, { desc }) => [desc(apikey.createdAt)],
            });

            // Parse metadata and permissions for each key
            const parsedKeys = keys.map((key) => {
                // Parse metadata from JSON string
                let metadata: Record<string, unknown> = {};
                if (key.metadata) {
                    try {
                        metadata = JSON.parse(String(key.metadata));
                    } catch {
                        metadata = {};
                    }
                }

                // Parse permissions from JSON string
                let permissions: { models?: string[] } | null = null;
                if (key.permissions) {
                    try {
                        permissions = JSON.parse(String(key.permissions));
                    } catch {
                        permissions = null;
                    }
                }

                // Extract turnstile from metadata
                const turnstile = metadata.turnstile as
                    | { enabled: boolean; hostnames: string[] }
                    | undefined;

                return {
                    id: key.id,
                    name: key.name,
                    prefix: key.prefix,
                    start: key.start,
                    enabled: key.enabled,
                    createdAt: key.createdAt,
                    updatedAt: key.updatedAt,
                    expiresAt: key.expiresAt,
                    lastRequest: key.lastRequest,
                    requestCount: key.requestCount,
                    // Parsed fields
                    metadata: {
                        description: metadata.description as string | undefined,
                        keyType: metadata.keyType as string | undefined,
                        plaintextKey: metadata.plaintextKey as
                            | string
                            | undefined,
                    },
                    permissions,
                    turnstile: turnstile || { enabled: false, hostnames: [] },
                };
            });

            return c.json({ keys: parsedKeys });
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
            const { allowedModels } = c.req.valid("json");

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

            console.log(
                "[PERMISSIONS UPDATE] Before update, existingKey.metadata:",
                existingKey.metadata,
                "type:",
                typeof existingKey.metadata,
            );

            // Use better-auth's server API to update permissions
            // userId is required for server-side calls to bypass auth checks
            const updatedKey = await authClient.api.updateApiKey({
                body: {
                    keyId: id,
                    userId: user.id,
                    permissions,
                },
            });

            console.log(
                "[PERMISSIONS UPDATE] After update, updatedKey:",
                updatedKey,
            );

            return c.json({
                id: updatedKey.id,
                name: updatedKey.name,
                permissions: updatedKey.permissions,
            });
        },
    )
    /**
     * Update metadata for an API key directly via DB.
     * Bypasses better-auth's buggy serializeApiKey which corrupts string metadata.
     */
    .post(
        "/:id/metadata",
        describeRoute({
            tags: ["Auth"],
            description:
                "Update metadata for an API key (bypasses better-auth bug).",
        }),
        validator("json", UpdateMetadataSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const metadataUpdate = c.req.valid("json");

            const db = drizzle(c.env.DB, { schema });

            // Verify ownership
            const existingKey = await db.query.apikey.findFirst({
                where: and(
                    eq(schema.apikey.id, id),
                    eq(schema.apikey.userId, user.id),
                ),
            });

            if (!existingKey) {
                throw new HTTPException(404, { message: "API key not found" });
            }

            // Parse existing metadata
            let existingMetadata: Record<string, unknown> = {};
            if (existingKey.metadata) {
                const metadataStr = String(existingKey.metadata);
                try {
                    existingMetadata = JSON.parse(metadataStr);
                } catch {
                    existingMetadata = {};
                }
            }

            // Merge new metadata with existing
            const newMetadata = {
                ...existingMetadata,
                ...metadataUpdate,
            };

            // Update directly via DB
            await db
                .update(schema.apikey)
                .set({
                    metadata: JSON.stringify(newMetadata),
                    updatedAt: new Date(),
                })
                .where(eq(schema.apikey.id, id));

            return c.json({
                id,
                metadata: newMetadata,
            });
        },
    )
    /**
     * Update Turnstile settings for an API key.
     * Stores settings in the metadata field (no schema migration needed).
     */
    .post(
        "/:id/turnstile",
        describeRoute({
            tags: ["Auth"],
            description:
                "Update Turnstile bot protection settings for an API key.",
        }),
        validator("json", TurnstileSettingsSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const turnstileSettings = c.req.valid("json");

            const db = drizzle(c.env.DB, { schema });

            // Verify ownership
            const existingKey = await db.query.apikey.findFirst({
                where: and(
                    eq(schema.apikey.id, id),
                    eq(schema.apikey.userId, user.id),
                ),
            });

            if (!existingKey) {
                throw new HTTPException(404, { message: "API key not found" });
            }

            // Parse existing metadata - handle string (from DB) case
            // IMPORTANT: Always parse as string first since DB stores as TEXT
            // The metadata column is TEXT type, so drizzle returns a string
            console.log(
                "[TURNSTILE POST] existingKey.metadata raw:",
                existingKey.metadata,
                "type:",
                typeof existingKey.metadata,
                "isString:",
                typeof existingKey.metadata === "string",
                "constructor:",
                existingKey.metadata?.constructor?.name,
            );
            let existingMetadata: Record<string, unknown> = {};
            if (existingKey.metadata) {
                // Always try to parse as JSON string first
                // Use String() to ensure we have a primitive string, not a String object
                const metadataStr = String(existingKey.metadata);
                try {
                    existingMetadata = JSON.parse(metadataStr);
                    console.log(
                        "[TURNSTILE POST] Parsed metadata:",
                        existingMetadata,
                    );
                } catch (e) {
                    console.log(
                        "[TURNSTILE POST] Failed to parse metadata:",
                        e,
                    );
                    existingMetadata = {};
                }
            }

            const newMetadata = {
                ...existingMetadata,
                turnstile: turnstileSettings,
            };
            console.log("[TURNSTILE POST] New metadata to save:", newMetadata);
            console.log(
                "[TURNSTILE POST] Stringified:",
                JSON.stringify(newMetadata),
            );

            // Update the metadata field directly
            await db
                .update(schema.apikey)
                .set({
                    metadata: JSON.stringify(newMetadata),
                    updatedAt: new Date(),
                })
                .where(eq(schema.apikey.id, id));
            console.log("[TURNSTILE POST] Saved successfully for key:", id);

            return c.json({
                id,
                turnstile: turnstileSettings,
            });
        },
    )
    /**
     * Get Turnstile settings for an API key.
     */
    .get(
        "/:id/turnstile",
        describeRoute({
            tags: ["Auth"],
            description:
                "Get Turnstile bot protection settings for an API key.",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();

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

            // Parse metadata - always parse as JSON string since DB stores as TEXT
            console.log(
                "[TURNSTILE GET] existingKey.metadata raw:",
                existingKey.metadata,
                "type:",
                typeof existingKey.metadata,
            );
            let metadata: Record<string, unknown> = {};
            if (existingKey.metadata) {
                // Always try to parse as JSON string
                const metadataStr = String(existingKey.metadata);
                try {
                    metadata = JSON.parse(metadataStr);
                    console.log("[TURNSTILE GET] Parsed metadata:", metadata);
                } catch (e) {
                    console.log("[TURNSTILE GET] Failed to parse metadata:", e);
                    metadata = {};
                }
            }
            console.log(
                "[TURNSTILE GET] Final turnstile value:",
                metadata.turnstile,
            );

            return c.json({
                id,
                turnstile: (metadata.turnstile as {
                    enabled: boolean;
                    hostnames: string[];
                }) || {
                    enabled: false,
                    hostnames: [],
                },
            });
        },
    );
