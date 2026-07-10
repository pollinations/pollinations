import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    type CommunityEndpointPriceKey,
    type CommunityEndpointVisibility,
    communityEndpointPrices,
    communityModelId,
    isCommunityEndpointOwnerAllowed,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    parseCommunityToolPrices,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { COMMUNITY_TOOL_NAME_PATTERN } from "@shared/registry/community-billing.ts";
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
import {
    buildPromptAgentDeploy,
    PromptAgentSchema,
    parseStoredPromptAgent,
} from "../services/prompt-agent.ts";
import {
    communityWorkerScriptName,
    deleteCommunityWorker,
    deployCommunityWorker,
    requireWorkerDeployConfig,
} from "../services/worker-deploy.ts";
import { hasDirectAccountPermission } from "./account-permissions.ts";

const PriceSchema = z.number().finite().min(0);
const UpdatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional(),
    ]),
) as unknown as Record<
    CommunityEndpointPriceKey,
    z.ZodType<number | undefined>
>;

const VisibilitySchema = z
    .enum(COMMUNITY_ENDPOINT_VISIBILITIES)
    .describe(
        '"private": owner-only, shown only to the owner, with no owner-set price. "public": anyone, listed in the catalog, priced. Publishing requires an allowlisted account and pricing.',
    );
// Whole-map semantics on update: sending toolPrices replaces the map; {} clears it.
const ToolPricesSchema = z
    .record(
        z
            .string()
            .regex(
                COMMUNITY_TOOL_NAME_PATTERN,
                "Tool names must be lowercase alphanumeric with _ or - (max 40 chars)",
            ),
        z.number().finite().positive().describe("Pollen per call."),
    )
    .describe(
        "Per-call tool fees, keyed by tool name (e.g. web_search). Each request is billed `fee × usage.tool_call_counts.<name>` as reported by the endpoint in its response usage object (on the final usage-bearing event for streams). On update the map is replaced whole; send {} to clear.",
    );
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

const CreateEndpointSchema = z
    .object({
        ...EndpointFieldsSchema,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        promptAgent: PromptAgentSchema.optional(),
        // A bearer token is only meaningful for self-hosted baseUrl endpoints;
        // prompt-agent deploys mint and manage their own worker token.
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        visibility: VisibilitySchema.optional().default("private"),
        toolPrices: ToolPricesSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .refine(
        (input) =>
            [input.baseUrl, input.promptAgent].filter(
                (value) => value !== undefined,
            ).length === 1,
        { message: "Provide exactly one of baseUrl or promptAgent" },
    )
    .refine(
        (input) => input.baseUrl === undefined || Boolean(input.bearerToken),
        {
            message: "bearerToken is required when registering with baseUrl",
        },
    );
const UpdateEndpointSchema = z
    .object({
        name: EndpointFieldsSchema.name.optional(),
        description: EndpointFieldsSchema.description,
        baseUrl: EndpointFieldsSchema.baseUrl.optional(),
        promptAgent: PromptAgentSchema.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        visibility: VisibilitySchema.optional(),
        toolPrices: ToolPricesSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .refine(
        (input) =>
            input.baseUrl === undefined || input.promptAgent === undefined,
        { message: "Provide only one of baseUrl or promptAgent" },
    );
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
    promptAgent: PromptAgentSchema.nullable().describe(
        "No-code agent config when this endpoint is a prompt agent; null otherwise.",
    ),
    upstreamModel: z.string(),
    visibility: VisibilitySchema,
    toolPrices: ToolPricesSchema,
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

function serializeToolPrices(
    toolPrices: Record<string, number> | undefined,
): string | null {
    if (!toolPrices || Object.keys(toolPrices).length === 0) return null;
    return JSON.stringify(toolPrices);
}

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

// The allowlist now gates SHARING (exposing an endpoint to any caller other
// than its owner), not creation. Anyone may register private endpoints for
// their own use; publishing requires an allowlisted account.
async function requireCommunitySharingAllowed(
    db: Db,
    userId: string,
): Promise<void> {
    const user = await db.query.user.findFirst({
        columns: { githubId: true },
        where: eq(schema.user.id, userId),
    });

    if (!isCommunityEndpointOwnerAllowed(user)) {
        throw new HTTPException(403, {
            message:
                "Publishing a community model is invite-only. It can stay private for your own use.",
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
    // A prompt agent stores its config (and the minted key id) in the
    // prompt_agent column; surface only the nested config — never the raw
    // blob or the internal key id.
    const storedPromptAgent = parseStoredPromptAgent(row.promptAgent);
    return {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        description: row.description,
        baseUrl: row.baseUrl,
        promptAgent: storedPromptAgent?.promptAgent ?? null,
        upstreamModel: row.upstreamModel,
        visibility: row.visibility,
        toolPrices: parseCommunityToolPrices(row.toolPrices),
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

// Managing endpoints (create/update/delete/probe) is open to any account with
// the API-key permission — the allowlist only applies when sharing (see
// requireCommunitySharingAllowed).
function requireCommunityEndpointManageAccess(apiKey?: {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}): void {
    requireCommunityEndpointManagePermission(apiKey);
}

// Prices a shared endpoint must carry so callers aren't billed zero. Base text
// pricing is the minimum; other buckets can stay 0.
const REQUIRED_SHARED_PRICE_KEYS: readonly CommunityEndpointPriceKey[] = [
    "promptTextPrice",
    "completionTextPrice",
];

// Enforce the publishing rules when an endpoint's effective visibility is
// public: the account must be allowlisted and the endpoint must be priced.
async function enforceSharingRules(
    db: Db,
    userId: string,
    visibility: CommunityEndpointVisibility,
    prices: Record<CommunityEndpointPriceKey, number>,
): Promise<void> {
    if (visibility !== "public") return;
    await requireCommunitySharingAllowed(db, userId);
    const missing = REQUIRED_SHARED_PRICE_KEYS.filter(
        (key) => !(prices[key] > 0),
    );
    if (missing.length > 0) {
        throw new HTTPException(400, {
            message: `A public model must set positive pricing: ${missing.join(", ")}`,
        });
    }
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
                "List private and public community text models owned by the authenticated account. API keys require `account:keys`.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
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
                "Register a private or public community text model. Private is the default. Public models require an allowlisted account with positive text pricing. API keys require `account:keys`. The upstream bearer token is encrypted and never returned.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            await ensureModelNameAvailable(db, user.id, input.name);
            // A private model is owner-only and free, so owner-declared public
            // pricing (token prices and tool fees) only applies when public.
            const prices =
                input.visibility === "public"
                    ? communityEndpointPrices(input)
                    : communityEndpointPrices({});
            const toolPrices =
                input.visibility === "public" ? input.toolPrices : undefined;
            await enforceSharingRules(db, user.id, input.visibility, prices);
            const id = crypto.randomUUID();
            // A prompt agent deploys the platform template to a managed worker:
            // the stored bearer token IS the generated worker auth token that
            // gen sends to the (public) workers.dev URL, so direct callers
            // without it are rejected. The owner's config is injected as
            // bindings alongside a freshly minted, scoped owner key.
            const deployConfig =
                input.promptAgent !== undefined
                    ? requireWorkerDeployConfig(c.env)
                    : null;
            const promptAgentDeploy =
                deployConfig && input.promptAgent !== undefined
                    ? await buildPromptAgentDeploy({
                          authClient: c.var.auth.client,
                          dbBinding: c.env.DB,
                          userId: user.id,
                          agentName: input.name,
                          config: input.promptAgent,
                          genBaseUrl:
                              (c.env as { GEN_BASE_URL?: string })
                                  .GEN_BASE_URL ??
                              "https://gen.pollinations.ai",
                      })
                    : null;
            const workerAuthToken = promptAgentDeploy
                ? crypto.randomUUID().replaceAll("-", "")
                : null;
            const baseUrl =
                deployConfig && promptAgentDeploy && workerAuthToken
                    ? await deployCommunityWorker(
                          deployConfig,
                          communityWorkerScriptName(id),
                          promptAgentDeploy.source,
                          workerAuthToken,
                          promptAgentDeploy.extraBindings,
                      )
                    : normalizeInputBaseUrl(input.baseUrl ?? "");
            // Guaranteed present in baseUrl mode by CreateEndpointSchema.
            const bearerToken =
                workerAuthToken ??
                normalizeInputBearerToken(input.bearerToken ?? "");
            try {
                const [row] = await db
                    .insert(schema.communityEndpoint)
                    .values({
                        id,
                        ownerUserId: user.id,
                        name: input.name,
                        description: input.description || null,
                        baseUrl,
                        promptAgent:
                            promptAgentDeploy?.storedPromptAgent ?? null,
                        upstreamModel: input.upstreamModel ?? input.name,
                        bearerTokenCiphertext: await encryptSecret(
                            bearerToken,
                            c.env.BETTER_AUTH_SECRET,
                        ),
                        visibility: input.visibility,
                        toolPrices: serializeToolPrices(toolPrices),
                        ...prices,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .returning();
                return c.json(toResponse(row, ownerGithubUsername));
            } catch (error) {
                // The worker is live but the row failed — remove the orphan so
                // there's no callable script without a backing endpoint, and
                // revoke the prompt agent's minted key.
                if (deployConfig) {
                    await deleteCommunityWorker(
                        deployConfig,
                        communityWorkerScriptName(id),
                    );
                }
                if (promptAgentDeploy) {
                    await db
                        .delete(schema.apikey)
                        .where(eq(schema.apikey.id, promptAgentDeploy.keyId));
                }
                throw error;
            }
        },
    )
    .post(
        "/models",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List Upstream Models",
            description:
                "Fetch OpenAI-compatible upstream model IDs before registering a My Models endpoint. API keys require `account:keys`.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
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
                "Test an OpenAI-compatible upstream model before registering it. API keys require `account:keys`.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
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
                "Update a community text model owned by the authenticated account. Changing visibility to public publishes it and requires an allowlisted account with positive text pricing. API keys require `account:keys`.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
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
            // Switching a prompt agent to a baseUrl endpoint retires its worker
            // (below) and must also revoke its minted owner key so it can no
            // longer spend. Redeploying a prompt agent mints a fresh key, so
            // the previous one is revoked either way.
            const previousPromptAgent = parseStoredPromptAgent(
                endpoint.promptAgent,
            );
            if (input.name !== undefined) update.name = input.name;
            if (input.description !== undefined) {
                update.description = input.description || null;
            }
            if (input.baseUrl !== undefined) {
                // Switching to a self-hosted URL retires the deployed worker
                // so it is no longer publicly callable.
                update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
                update.promptAgent = null;
                if (endpoint.promptAgent !== null) {
                    await deleteCommunityWorker(
                        requireWorkerDeployConfig(c.env),
                        communityWorkerScriptName(endpoint.id),
                    );
                }
            }
            if (input.promptAgent !== undefined) {
                // Redeploy the same id-keyed script with the new config, a
                // freshly minted owner key, and a fresh worker auth token; the
                // token becomes the stored bearer token gen sends.
                const deployConfig = requireWorkerDeployConfig(c.env);
                const promptAgentDeploy = await buildPromptAgentDeploy({
                    authClient: c.var.auth.client,
                    dbBinding: c.env.DB,
                    userId: user.id,
                    agentName: input.name ?? endpoint.name,
                    config: input.promptAgent,
                    genBaseUrl:
                        (c.env as { GEN_BASE_URL?: string }).GEN_BASE_URL ??
                        "https://gen.pollinations.ai",
                });
                const workerAuthToken = crypto
                    .randomUUID()
                    .replaceAll("-", "");
                update.baseUrl = await deployCommunityWorker(
                    deployConfig,
                    communityWorkerScriptName(endpoint.id),
                    promptAgentDeploy.source,
                    workerAuthToken,
                    promptAgentDeploy.extraBindings,
                );
                update.promptAgent = promptAgentDeploy.storedPromptAgent;
                update.bearerTokenCiphertext = await encryptSecret(
                    workerAuthToken,
                    c.env.BETTER_AUTH_SECRET,
                );
            }
            if (input.upstreamModel !== undefined) {
                update.upstreamModel = input.upstreamModel;
            }
            // A caller-supplied bearer token only applies to self-hosted
            // endpoints; prompt-agent deploys manage their own token above.
            if (
                input.bearerToken !== undefined &&
                input.promptAgent === undefined
            ) {
                update.bearerTokenCiphertext = await encryptSecret(
                    normalizeInputBearerToken(input.bearerToken),
                    c.env.BETTER_AUTH_SECRET,
                );
            }
            if (input.visibility !== undefined) {
                update.visibility = input.visibility;
            }
            if (input.toolPrices !== undefined) {
                update.toolPrices = serializeToolPrices(input.toolPrices);
            }
            for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
                if (input[field.key] !== undefined) {
                    update[field.key] = input[field.key];
                }
            }
            // Enforce sharing rules against the effective post-update state:
            // the incoming visibility (or the stored one) plus prices merged
            // from the existing row and this update's changes.
            const effectiveVisibility = input.visibility ?? endpoint.visibility;
            if (effectiveVisibility === "private") {
                // A private model is owner-only, so owner-declared public
                // pricing does not apply. This also clears prices (and tool
                // fees) when a published model is made private again.
                Object.assign(update, communityEndpointPrices({}));
                update.toolPrices = null;
            }
            const effectivePrices = communityEndpointPrices({
                ...endpoint,
                ...update,
            });
            await enforceSharingRules(
                db,
                user.id,
                effectiveVisibility,
                effectivePrices,
            );
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
            // Revoke the old prompt agent's minted key after the row no longer
            // references it (the worker was retired or redeployed above).
            const replacedKey =
                input.baseUrl !== undefined || input.promptAgent !== undefined;
            if (previousPromptAgent && replacedKey) {
                await db
                    .delete(schema.apikey)
                    .where(eq(schema.apikey.id, previousPromptAgent.keyId));
            }
            return c.json(toResponse(row, ownerGithubUsername));
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Delete My Model",
            description:
                "Delete a community text model owned by the authenticated account. API keys require `account:keys`.",
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
            requireCommunityEndpointManageAccess(c.var.auth.apiKey);
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            // Retire the deployed worker first; a failure here must not leave
            // a callable script with no backing row, so it happens before the
            // D1 delete. Then revoke the minted owner key injected into the
            // worker so it can no longer spend once the agent is gone.
            const storedPromptAgent = parseStoredPromptAgent(
                endpoint.promptAgent,
            );
            if (storedPromptAgent) {
                await deleteCommunityWorker(
                    requireWorkerDeployConfig(c.env),
                    communityWorkerScriptName(endpoint.id),
                );
                await db
                    .delete(schema.apikey)
                    .where(eq(schema.apikey.id, storedPromptAgent.keyId));
            }
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
