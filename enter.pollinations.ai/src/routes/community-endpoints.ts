import {
    COMMUNITY_ENDPOINT_KINDS,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointPriceKey,
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
const CreatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional()
            .default(0)
            .describe(`${field.label} price in Pollen per token.`),
    ]),
) as unknown as Record<CommunityEndpointPriceKey, z.ZodType<number>>;
const UpdatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional().describe(
            `${field.label} price in Pollen per token.`,
        ),
    ]),
) as unknown as Record<
    CommunityEndpointPriceKey,
    z.ZodType<number | undefined>
>;

const CAPABILITY_FLAG_KEYS = ["tools", "search", "reasoning"] as const;
const KindSchema = z
    .enum(COMMUNITY_ENDPOINT_KINDS)
    .describe(
        '"model" for a plain upstream model; "agent" for an endpoint that runs multi-step or tool-using logic behind the chat-completions shape.',
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
// 1 MiB is well under Cloudflare's per-script size limit and far larger than
// any hand-written single-module bee; the cap keeps unbounded blobs out of D1
// and the upload.
const MAX_SOURCE_BYTES = 1_048_576;
const SourceSchema = z
    .string()
    .min(1)
    .max(MAX_SOURCE_BYTES)
    .describe(
        "Single-ES-module JavaScript worker source (max 1 MiB) exposing an OpenAI-compatible API (POST /v1/chat/completions). Deployed to a Pollinations-managed Cloudflare Worker and the model's baseUrl is set to its workers.dev URL. Mutually exclusive with baseUrl.",
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
        source: SourceSchema.optional(),
        promptAgent: PromptAgentSchema.optional(),
        kind: KindSchema.optional().default("model"),
        tools: z
            .boolean()
            .optional()
            .default(false)
            .describe(
                "Declares tool/function-calling support (metadata only).",
            ),
        search: z
            .boolean()
            .optional()
            .default(false)
            .describe("Declares web-search capability (metadata only)."),
        reasoning: z
            .boolean()
            .optional()
            .default(false)
            .describe("Declares reasoning/thinking support (metadata only)."),
        // Ignored for source deploys — the worker auth token is generated
        // server-side and stored as the bearer token in that mode.
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        toolPrices: ToolPricesSchema.optional(),
        ...CreatePriceFieldsSchema,
    })
    .refine(
        (input) =>
            [input.baseUrl, input.source, input.promptAgent].filter(
                (value) => value !== undefined,
            ).length === 1,
        { message: "Provide exactly one of baseUrl, source, or promptAgent" },
    )
    .refine(
        // A bearer token is only meaningful for self-hosted baseUrl endpoints;
        // source and promptAgent deploys mint and manage their own worker token.
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
        source: SourceSchema.optional(),
        upstreamModel: EndpointFieldsSchema.upstreamModel,
        bearerToken: EndpointFieldsSchema.bearerToken.optional(),
        kind: KindSchema.optional(),
        tools: z
            .boolean()
            .optional()
            .describe(
                "Declares tool/function-calling support (metadata only).",
            ),
        search: z
            .boolean()
            .optional()
            .describe("Declares web-search capability (metadata only)."),
        reasoning: z
            .boolean()
            .optional()
            .describe("Declares reasoning/thinking support (metadata only)."),
        toolPrices: ToolPricesSchema.optional(),
        ...UpdatePriceFieldsSchema,
    })
    .refine(
        (input) => input.baseUrl === undefined || input.source === undefined,
        { message: "Provide only one of baseUrl or source" },
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
    source: z
        .string()
        .nullable()
        .describe(
            "Worker source for platform-deployed endpoints; null when self-hosted or a prompt agent.",
        ),
    promptAgent: PromptAgentSchema.nullable().describe(
        "No-code agent config when this endpoint is a prompt agent; null otherwise.",
    ),
    upstreamModel: z.string(),
    kind: KindSchema,
    tools: z.boolean(),
    search: z.boolean(),
    reasoning: z.boolean(),
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
    // A prompt agent stores its config (and the minted key id) in `source`;
    // surface the config as `promptAgent` and never expose the raw blob or the
    // internal key id. Its platform-owned template is not user source, so
    // `source` reads as null for prompt agents.
    const storedPromptAgent = parseStoredPromptAgent(row.source);
    return {
        id: row.id,
        modelId: communityModelId(ownerGithubUsername, row.name),
        name: row.name,
        description: row.description,
        baseUrl: row.baseUrl,
        source: storedPromptAgent ? null : row.source,
        promptAgent: storedPromptAgent?.promptAgent ?? null,
        upstreamModel: row.upstreamModel,
        kind: row.kind,
        tools: row.tools,
        search: row.search,
        reasoning: row.reasoning,
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
                'Register an invite-only community text model or agent. API keys require `account:keys` and an account with `communityEndpointsAllowed: true`. The upstream bearer token is encrypted and never returned. Callers are billed your declared per-token prices plus any `toolPrices` fees; to charge tool fees the endpoint reports per-tool call counts in `usage.tool_call_counts` (e.g. `{"web_search": 2}`) on its response — for streams, on the final usage-bearing event. Provide exactly one of `baseUrl` (self-hosted endpoint) or `source` (worker source deployed to a Pollinations-managed Cloudflare Worker; `baseUrl` is set to the deployed URL).',
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
            // Source and promptAgent both deploy a Pollinations-managed worker:
            // the stored bearer token IS the generated worker auth token that
            // gen sends to the (public) workers.dev URL, so direct callers
            // without it are rejected. A prompt agent additionally deploys the
            // fixed template with the owner's config injected as bindings.
            const isManagedDeploy =
                input.source !== undefined || input.promptAgent !== undefined;
            const deployConfig = isManagedDeploy
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
                      })
                    : null;
            const workerAuthToken = deployConfig
                ? crypto.randomUUID().replaceAll("-", "")
                : null;
            const baseUrl = deployConfig
                ? await deployCommunityWorker(
                      deployConfig,
                      communityWorkerScriptName(id),
                      promptAgentDeploy?.source ?? (input.source as string),
                      workerAuthToken as string,
                      promptAgentDeploy?.extraBindings,
                  )
                : normalizeInputBaseUrl(input.baseUrl ?? "");
            // Guaranteed present in baseUrl mode by CreateEndpointSchema.
            const bearerToken =
                workerAuthToken ??
                normalizeInputBearerToken(input.bearerToken ?? "");
            // Prompt agents default to the agent kind; source/baseUrl keep the
            // caller's choice (which itself defaults to "model").
            const kind =
                input.promptAgent !== undefined && input.kind === "model"
                    ? "agent"
                    : input.kind;
            // Prompt agents store their structured config (+ minted key id) in
            // the source column; source deploys store the raw worker source.
            const storedSource = promptAgentDeploy
                ? promptAgentDeploy.storedSource
                : (input.source ?? null);
            try {
                const [row] = await db
                    .insert(schema.communityEndpoint)
                    .values({
                        id,
                        ownerUserId: user.id,
                        name: input.name,
                        description: input.description || null,
                        baseUrl,
                        source: storedSource,
                        upstreamModel: input.upstreamModel ?? input.name,
                        bearerTokenCiphertext: await encryptSecret(
                            bearerToken,
                            c.env.BETTER_AUTH_SECRET,
                        ),
                        kind,
                        tools: input.tools,
                        search: input.search,
                        reasoning: input.reasoning,
                        toolPrices: serializeToolPrices(input.toolPrices),
                        ...communityEndpointPrices(input),
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
            // Switching a prompt agent to a baseUrl or source endpoint retires
            // its worker (below) and must also revoke its minted owner key so
            // it can no longer spend.
            const previousPromptAgent = parseStoredPromptAgent(endpoint.source);
            const switchingAway =
                input.baseUrl !== undefined || input.source !== undefined;
            if (input.name !== undefined) update.name = input.name;
            if (input.description !== undefined) {
                update.description = input.description || null;
            }
            if (input.baseUrl !== undefined) {
                // Switching to a self-hosted URL retires the deployed worker
                // so it is no longer publicly callable.
                update.baseUrl = normalizeInputBaseUrl(input.baseUrl);
                update.source = null;
                if (endpoint.source !== null) {
                    await deleteCommunityWorker(
                        requireWorkerDeployConfig(c.env),
                        communityWorkerScriptName(endpoint.id),
                    );
                }
            }
            if (input.source !== undefined) {
                // Redeploy the same id-keyed script with a fresh auth token;
                // the token becomes the stored bearer token gen sends. A prompt
                // agent's template bindings are dropped by this overwrite.
                const deployConfig = requireWorkerDeployConfig(c.env);
                const workerAuthToken = crypto.randomUUID().replaceAll("-", "");
                update.baseUrl = await deployCommunityWorker(
                    deployConfig,
                    communityWorkerScriptName(endpoint.id),
                    input.source,
                    workerAuthToken,
                );
                update.source = input.source;
                update.bearerTokenCiphertext = await encryptSecret(
                    workerAuthToken,
                    c.env.BETTER_AUTH_SECRET,
                );
            }
            if (input.upstreamModel !== undefined) {
                update.upstreamModel = input.upstreamModel;
            }
            // A caller-supplied bearer token only applies to self-hosted
            // endpoints; source deploys manage their own token above.
            if (input.bearerToken !== undefined && input.source === undefined) {
                update.bearerTokenCiphertext = await encryptSecret(
                    normalizeInputBearerToken(input.bearerToken),
                    c.env.BETTER_AUTH_SECRET,
                );
            }
            if (input.kind !== undefined) update.kind = input.kind;
            for (const flag of CAPABILITY_FLAG_KEYS) {
                if (input[flag] !== undefined) update[flag] = input[flag];
            }
            if (input.toolPrices !== undefined) {
                update.toolPrices = serializeToolPrices(input.toolPrices);
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
            // Revoke the old prompt agent's minted key after the row no longer
            // references it (the worker was already retired above).
            if (previousPromptAgent && switchingAway) {
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
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            // Retire the deployed worker first; a failure here must not leave
            // a callable script with no backing row, so it happens before the
            // D1 delete.
            if (endpoint.source !== null) {
                await deleteCommunityWorker(
                    requireWorkerDeployConfig(c.env),
                    communityWorkerScriptName(endpoint.id),
                );
            }
            // Prompt agents mint a dedicated owner key injected into the worker;
            // remove it so it can no longer spend once the agent is gone.
            const storedPromptAgent = parseStoredPromptAgent(endpoint.source);
            if (storedPromptAgent) {
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
