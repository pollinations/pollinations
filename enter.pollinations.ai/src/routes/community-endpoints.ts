import {
    COMMUNITY_ENDPOINT_KINDS,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointPriceKey,
    communityEndpointPrices,
    communityModelId,
    isCommunityEndpointOwnerAllowed,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    listCommunityEndpointModels,
    testCommunityEndpoint,
} from "../services/community-endpoint-openai.ts";
import { hasDirectAccountPermission } from "./account-permissions.ts";

const PriceSchema = z.number().finite().min(0);
const CreatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional().default(0),
    ]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const UpdatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional(),
    ]),
) as unknown as Record<
    CommunityEndpointPriceKey,
    z.ZodType<number | undefined>
>;

const CAPABILITY_FLAG_KEYS = ["tools", "search", "reasoning"] as const;
const KindSchema = z.enum(COMMUNITY_ENDPOINT_KINDS);
const EndpointFieldsSchema = {
    // No "/": the public model id is `<owner>/<name>`, so a slash in the name
    // would inject a second separator and let one model spoof another's id.
    name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[^/]+$/, "Model name cannot contain '/'"),
    description: z.string().trim().max(240).optional(),
    baseUrl: z.string().url(),
    upstreamModel: z.string().trim().min(1).max(253).optional(),
    bearerToken: z.string().min(1),
} as const;

const MaxRequestPriceSchema = z.number().finite().positive();
const CreateEndpointSchema = z.object({
    ...EndpointFieldsSchema,
    kind: KindSchema.optional().default("model"),
    tools: z.boolean().optional().default(false),
    search: z.boolean().optional().default(false),
    reasoning: z.boolean().optional().default(false),
    maxRequestPrice: MaxRequestPriceSchema.optional().default(1),
    ...CreatePriceFieldsSchema,
});
const UpdateEndpointSchema = z.object({
    name: EndpointFieldsSchema.name.optional(),
    description: EndpointFieldsSchema.description,
    baseUrl: EndpointFieldsSchema.baseUrl.optional(),
    upstreamModel: EndpointFieldsSchema.upstreamModel,
    bearerToken: EndpointFieldsSchema.bearerToken.optional(),
    kind: KindSchema.optional(),
    tools: z.boolean().optional(),
    search: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    maxRequestPrice: MaxRequestPriceSchema.optional(),
    ...UpdatePriceFieldsSchema,
});
const ModelListSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().min(1),
});
const TestEndpointSchema = z.object({
    baseUrl: z.string().url(),
    bearerToken: z.string().min(1),
    model: z.string().trim().min(1).max(253),
});
const ResponsePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, z.number()]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const CommunityEndpointResponseSchema = z.object({
    id: z.string(),
    modelId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    baseUrl: z.string(),
    upstreamModel: z.string(),
    kind: KindSchema,
    tools: z.boolean(),
    search: z.boolean(),
    reasoning: z.boolean(),
    maxRequestPrice: z.number(),
    ...ResponsePriceFieldsSchema,
    disabled: z.boolean(),
    disabledReason: z.string().nullable(),
    disabledAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const CommunityEndpointListResponseSchema = z.object({
    data: z.array(CommunityEndpointResponseSchema),
});
const CommunityEndpointModelsResponseSchema = z.object({
    data: z.array(z.string()),
});
const CommunityEndpointTestResponseSchema = z
    .object({
        ok: z.boolean(),
        message: z.string(),
    })
    .passthrough();
const CommunityEndpointDeleteResponseSchema = z.object({
    id: z.string(),
});
const ENDPOINT_PROBE_THROTTLE_SECONDS = 30;
type Db = ReturnType<typeof drizzle<typeof schema>>;
type CommunityEndpointRow = typeof schema.communityEndpoint.$inferSelect;

function normalizeInputBaseUrl(value: string): string {
    try {
        return normalizeCommunityEndpointBaseUrl(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error ? error.message : "Invalid endpoint URL",
        });
    }
}

function normalizeInputBearerToken(value: string): string {
    try {
        return normalizeCommunityEndpointBearerToken(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error
                    ? error.message
                    : "Invalid API bearer token",
        });
    }
}

async function requireCommunityEndpointAccess(
    db: Db,
    userId: string,
): Promise<void> {
    const user = await db.query.user.findFirst({
        columns: { githubId: true },
        where: eq(schema.user.id, userId),
    });

    if (!isCommunityEndpointOwnerAllowed(user)) {
        throw new HTTPException(403, {
            message: "Community endpoints are invite-only",
        });
    }
}

async function requireOwnerGithubUsername(
    db: Db,
    userId: string,
): Promise<string> {
    const owner = await db.query.user.findFirst({
        columns: { githubUsername: true },
        where: eq(schema.user.id, userId),
    });
    if (owner?.githubUsername) return owner.githubUsername;
    throw new HTTPException(400, {
        message:
            "A GitHub username is required to register community endpoints",
    });
}

function toResponse(row: CommunityEndpointRow, ownerGithubUsername: string) {
    return {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        description: row.description,
        baseUrl: row.baseUrl,
        upstreamModel: row.upstreamModel,
        kind: row.kind,
        tools: row.tools,
        search: row.search,
        reasoning: row.reasoning,
        maxRequestPrice: row.maxRequestPrice,
        ...communityEndpointPrices(row),
        disabled: row.disabledAt !== null,
        disabledReason: row.disabledReason,
        disabledAt: row.disabledAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function requireOwnedEndpoint(db: Db, id: string, ownerUserId: string) {
    const row = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.id, id),
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
        ),
    });
    if (!row) {
        throw new HTTPException(404, {
            message: "Community endpoint not found",
        });
    }
    return row;
}

async function ensureModelNameAvailable(
    db: Db,
    ownerUserId: string,
    name: string,
    currentId?: string,
): Promise<void> {
    const existing = await db.query.communityEndpoint.findFirst({
        columns: { id: true },
        where: and(
            eq(schema.communityEndpoint.ownerUserId, ownerUserId),
            eq(schema.communityEndpoint.name, name),
        ),
    });
    if (!existing || existing.id === currentId) return;
    throw new HTTPException(400, {
        message: "Community model name is already registered",
    });
}

function throwEndpointTestError(error: unknown): never {
    throw new HTTPException(400, {
        message:
            error instanceof Error ? error.message : "Endpoint test failed",
    });
}

type EndpointProbeKind = "models" | "test";

function requireCommunityEndpointManagePermission(apiKey?: {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}): void {
    if (!apiKey) return;
    if (!hasDirectAccountPermission(apiKey, "keys")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:keys' permission",
        });
    }
}

async function requireCommunityEndpointManageAccess(
    db: Db,
    userId: string,
    apiKey?: {
        permissions?: Record<string, string[]>;
        metadata?: Record<string, unknown>;
    },
): Promise<void> {
    requireCommunityEndpointManagePermission(apiKey);
    await requireCommunityEndpointAccess(db, userId);
}

async function enforceEndpointProbeThrottle(
    c: Pick<Context<Env>, "env" | "json">,
    userId: string,
    kind: EndpointProbeKind,
): Promise<Response | undefined> {
    const throttleKey = `community-endpoint-${kind}:throttle:${userId}`;
    const now = Date.now();
    const throttleUntil = Number(await c.env.KV.get(throttleKey));
    if (Number.isFinite(throttleUntil) && throttleUntil > now) {
        return c.json(
            {
                error: "rate_limited",
                message:
                    "Community endpoint probes are limited to once every 30 seconds.",
            },
            429,
            { "Retry-After": String(ENDPOINT_PROBE_THROTTLE_SECONDS) },
        );
    }
    await c.env.KV.put(
        throttleKey,
        String(now + ENDPOINT_PROBE_THROTTLE_SECONDS * 1000),
        {
            expirationTtl: 60,
        },
    );
    return undefined;
}

export const communityEndpointsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List My Models",
            description:
                "List invite-only community text models owned by the authenticated account. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`; dashboard sessions can manage models directly when enabled.",
            responses: {
                200: {
                    description: "Registered community text models",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointListResponseSchema,
                            ),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const rows = await db.query.communityEndpoint.findMany({
                where: eq(schema.communityEndpoint.ownerUserId, user.id),
                orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
            });
            return c.json({
                data: rows.map((row) => toResponse(row, ownerGithubUsername)),
            });
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create My Model",
            description:
                "Register an invite-only community text model. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`. The upstream bearer token is encrypted and never returned.",
            responses: {
                200: {
                    description: "Created community text model",
                    content: {
                        "application/json": {
                            schema: resolver(CommunityEndpointResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid model configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            await ensureModelNameAvailable(db, user.id, input.name);
            const id = crypto.randomUUID();
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id,
                    ownerUserId: user.id,
                    name: input.name,
                    description: input.description || null,
                    baseUrl: normalizeInputBaseUrl(input.baseUrl),
                    upstreamModel: input.upstreamModel ?? input.name,
                    bearerTokenCiphertext: await encryptSecret(
                        normalizeInputBearerToken(input.bearerToken),
                        c.env.BETTER_AUTH_SECRET,
                    ),
                    kind: input.kind,
                    tools: input.tools,
                    search: input.search,
                    reasoning: input.reasoning,
                    maxRequestPrice: input.maxRequestPrice,
                    ...communityEndpointPrices(input),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(toResponse(row, ownerGithubUsername));
        },
    )
    .post(
        "/models",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Upstream Models",
            description:
                "Fetch OpenAI-compatible upstream model IDs before registering a My Models endpoint. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`.",
            responses: {
                200: {
                    description: "Upstream model IDs",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointModelsResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Endpoint probe failed" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                429: { description: "Probe rate limited" },
            },
        }),
        validator("json", ModelListSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const throttled = await enforceEndpointProbeThrottle(
                c,
                user.id,
                "models",
            );
            if (throttled) return throttled;
            try {
                const models = await listCommunityEndpointModels(input);
                return c.json({ data: models });
            } catch (error) {
                throwEndpointTestError(error);
            }
        },
    )
    .post(
        "/test",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Test My Model Endpoint",
            description:
                "Test an OpenAI-compatible upstream model before registering it. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`.",
            responses: {
                200: {
                    description: "Endpoint test result",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointTestResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Endpoint test failed" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                429: { description: "Probe rate limited" },
            },
        }),
        validator("json", TestEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const throttled = await enforceEndpointProbeThrottle(
                c,
                user.id,
                "test",
            );
            if (throttled) return throttled;
            try {
                const result = await testCommunityEndpoint(input);
                return c.json({
                    ok: true,
                    message: "Endpoint responded with usage",
                    ...result,
                });
            } catch (error) {
                throwEndpointTestError(error);
            }
        },
    )
    .post(
        "/:id/update",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update My Model",
            description:
                "Update an invite-only community text model owned by the authenticated account. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`.",
            responses: {
                200: {
                    description: "Updated community text model",
                    content: {
                        "application/json": {
                            schema: resolver(CommunityEndpointResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid model configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Community endpoint not found" },
            },
        }),
        validator("json", UpdateEndpointSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            await ensureModelNameAvailable(
                db,
                user.id,
                input.name ?? endpoint.name,
                id,
            );

            const update: Partial<
                typeof schema.communityEndpoint.$inferInsert
            > = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) update.name = input.name;
            if (input.description !== undefined) {
                update.description = input.description || null;
            }
            if (input.baseUrl !== undefined) {
                update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
            }
            if (input.upstreamModel !== undefined) {
                update.upstreamModel = input.upstreamModel;
            }
            if (input.bearerToken !== undefined) {
                update.bearerTokenCiphertext = await encryptSecret(
                    normalizeInputBearerToken(input.bearerToken),
                    c.env.BETTER_AUTH_SECRET,
                );
            }
            if (input.kind !== undefined) update.kind = input.kind;
            for (const flag of CAPABILITY_FLAG_KEYS) {
                if (input[flag] !== undefined) update[flag] = input[flag];
            }
            if (input.maxRequestPrice !== undefined) {
                update.maxRequestPrice = input.maxRequestPrice;
            }
            for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
                if (input[field.key] !== undefined) {
                    update[field.key] = input[field.key];
                }
            }
            const [row] = await db
                .update(schema.communityEndpoint)
                .set(update)
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                    ),
                )
                .returning();
            return c.json(toResponse(row, ownerGithubUsername));
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete My Model",
            description:
                "Delete an invite-only community text model owned by the authenticated account. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`.",
            responses: {
                200: {
                    description: "Deleted community text model",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityEndpointDeleteResponseSchema,
                            ),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Community endpoint not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireCommunityEndpointManageAccess(
                db,
                user.id,
                c.var.auth.apiKey,
            );
            await requireOwnedEndpoint(db, id, user.id);
            await db
                .delete(schema.communityEndpoint)
                .where(
                    and(
                        eq(schema.communityEndpoint.id, id),
                        eq(schema.communityEndpoint.ownerUserId, user.id),
                    ),
                );
            return c.json({ id });
        },
    );
