import { validateCommunityEndpointUrl } from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
    type CommunityEndpointVisibility,
    communityModelId,
    type EndpointAgentListingPayload,
    effectiveCommunityEndpointVisibility,
    isCommunityEndpointOwnerAllowed,
    normalizeCommunityEndpointBearerToken,
    normalizeCommunityProviderUrl,
    type ProxyListingPayload,
    parseListingPayload,
    pendingCommunityEndpointChangeIsReady,
    resolveEffectiveProxyListing,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    type CommunityEndpointTestResult,
    listCommunityEndpointModels,
    testCommunityEmbeddingEndpoint,
    testCommunityEndpoint,
    testCommunityImageEndpoint,
    testCommunitySpeechEndpoint,
    testCommunityTranscriptionEndpoint,
    testCommunityVideoEndpoint,
} from "../services/community-endpoint-openai.ts";
import { requireAccountPermission } from "./account-permissions.ts";
import {
    type FallbackPrimary,
    fallbackTargetRejection,
    resolveFallbacks,
} from "./community-endpoints/fallbacks.ts";
import { toCommunityEndpointResponse } from "./community-endpoints/presenter.ts";
import {
    changesProxyPayload,
    deriveCreateProxyPolicy,
    deriveUpdatedProxyPolicy,
    hasProxyPricingInput,
    proxyPricingChanged,
    withoutProxyPricingChanges,
} from "./community-endpoints/proxy-policy.ts";
import {
    assertValidUpdate,
    CommunityEndpointDeleteResponseSchema,
    CommunityEndpointListResponseSchema,
    CommunityEndpointModelsResponseSchema,
    CommunityEndpointResponseSchema,
    CommunityEndpointTestResponseSchema,
    CommunityProviderProfileInputSchema,
    CommunityProviderProfileResponseSchema,
    CreateEndpointAgentSchema,
    CreateEndpointSchema,
    EndpointAgentResponseSchema,
    FallbackCandidatesResponseSchema,
    ModelListSchema,
    TestEndpointSchema,
    UpdateEndpointSchema,
} from "./community-endpoints/schemas.ts";

const ENDPOINT_PROBE_THROTTLE_SECONDS = 30;
type Db = ReturnType<typeof drizzle<typeof schema>>;
function validateInputEndpointUrl(value: string): string {
    try {
        return validateCommunityEndpointUrl(value);
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

function normalizeInputProviderUrl(value: string): string {
    try {
        return normalizeCommunityProviderUrl(value);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error ? error.message : "Invalid provider URL",
        });
    }
}

// Anyone may register private endpoints for their own use and probe their own
// upstream. Publishing requires an allowlisted account.
async function requireCommunityEndpointPublishAccess(
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
                "Community model publishing requires approval. Models can stay private for your own use.",
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

// Publishing is allowlist-gated. Pricing is independent: public endpoints may
// be free or owner-priced.
async function enforcePublishingAccess(
    db: Db,
    userId: string,
    visibility: CommunityEndpointVisibility,
): Promise<void> {
    if (visibility !== "public") return;
    await requireCommunityEndpointPublishAccess(db, userId);
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
            tags: ["🧩 Community Models"],
            summary: "List My Models",
            description:
                "List private and public community models owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Registered community models",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const rows = await db
                .select()
                .from(schema.communityEndpoint)
                .where(eq(schema.communityEndpoint.ownerUserId, user.id))
                .orderBy(desc(schema.communityEndpoint.createdAt));
            const owner = await db.query.user.findFirst({
                columns: {
                    communityProviderName: true,
                    communityProviderUrl: true,
                },
                where: eq(schema.user.id, user.id),
            });
            return c.json(
                CommunityEndpointListResponseSchema.parse({
                    data: rows.map((endpoint) =>
                        toCommunityEndpointResponse(
                            endpoint,
                            ownerGithubUsername,
                            c.env.AGENT_RUNTIME_BASE_URL,
                        ),
                    ),
                    provider: {
                        name: owner?.communityProviderName ?? null,
                        url: owner?.communityProviderUrl ?? null,
                    },
                }),
            );
        },
    )
    .post(
        "/provider",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Update Community Provider Profile",
            description:
                "Set the public provider name and HTTPS service link shared by all community models owned by the authenticated account. Send both fields empty to clear the profile. Publishing approval and `account:keys` are required.",
            responses: {
                200: {
                    description: "Updated community provider profile",
                    content: {
                        "application/json": {
                            schema: resolver(
                                CommunityProviderProfileResponseSchema,
                            ),
                        },
                    },
                },
                400: { description: "Invalid provider profile" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CommunityProviderProfileInputSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            await requireCommunityEndpointPublishAccess(db, user.id);

            const name = input.name.trim();
            const url = input.url.trim();
            if (Boolean(name) !== Boolean(url)) {
                throw new HTTPException(400, {
                    message: "Provider name and URL must be set together",
                });
            }

            const [profile] = await db
                .update(schema.user)
                .set({
                    communityProviderName: name || null,
                    communityProviderUrl: url
                        ? normalizeInputProviderUrl(url)
                        : null,
                    updatedAt: new Date(),
                })
                .where(eq(schema.user.id, user.id))
                .returning({
                    name: schema.user.communityProviderName,
                    url: schema.user.communityProviderUrl,
                });
            return c.json(profile);
        },
    )
    .get(
        "/:id/fallback-candidates",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "List Fallback Candidates",
            description:
                "Community models this model may declare as fallbacks: listed, public or owned by you, same modality, and priced at or below it on every price field. Computed with the same rule the update endpoint validates against, so every id listed here is accepted. Eligibility is re-checked when a request is routed, so a target repriced above this model afterwards stops serving without changing the stored list.",
            responses: {
                200: {
                    description: "Eligible fallback model ids",
                    content: {
                        "application/json": {
                            schema: resolver(FallbackCandidatesResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Model not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const endpoint = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.id, c.req.param("id")),
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                ),
            });
            if (!endpoint) {
                throw new HTTPException(404, { message: "Model not found" });
            }
            if (endpoint.type !== "proxy") return c.json({ data: [] });
            const currentPayload = parseListingPayload(
                "proxy",
                endpoint.payload,
            );
            if (!currentPayload) {
                throw new Error(`Invalid proxy payload for ${endpoint.id}`);
            }
            const endpointPayload = resolveEffectiveProxyListing({
                visibility: endpoint.visibility,
                payload: currentPayload,
                pendingVisibility: endpoint.pendingVisibility,
                pendingPayload: parseListingPayload(
                    "proxy",
                    endpoint.pendingPayload,
                ),
                pendingAt: endpoint.pendingAt,
            }).payload;
            const primary: FallbackPrimary = {
                modelId: communityModelId(ownerGithubUsername, endpoint.name),
                ownerUserId: user.id,
                modality: endpointPayload.modality,
                imagePricing: endpointPayload.imagePricing,
                paidOnly: endpointPayload.paidOnly,
                prices: endpointPayload.prices,
                inputModalities: endpointPayload.inputModalities,
            };
            const candidates = await db
                .select({
                    endpoint: schema.communityEndpoint,
                    ownerGithubUsername: schema.user.githubUsername,
                })
                .from(schema.communityEndpoint)
                .innerJoin(
                    schema.user,
                    eq(schema.communityEndpoint.ownerUserId, schema.user.id),
                );
            const data = candidates
                .flatMap(({ endpoint: row, ownerGithubUsername: owner }) => {
                    if (!owner) return [];
                    const modelId = communityModelId(owner, row.name);
                    return fallbackTargetRejection(primary, modelId, row)
                        ? []
                        : [modelId];
                })
                .sort();
            return c.json({ data });
        },
    )
    .post(
        "/endpoint-agents",
        describeRoute({
            tags: ["🤖 Community Agents"],
            summary: "Create Endpoint Agent",
            description:
                "Register an agent running on an external OpenAI-compatible endpoint. Pollinations sends a short-lived agent run token instead of a stored bearer credential. Private is the default; public agents require an allowlisted account and become public after 3 hours. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Created endpoint agent",
                    content: {
                        "application/json": {
                            schema: resolver(EndpointAgentResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid endpoint agent configuration" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        validator("json", CreateEndpointAgentSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            await ensureModelNameAvailable(db, user.id, input.name);
            await enforcePublishingAccess(db, user.id, input.visibility);
            const queuesPublication = input.visibility === "public";
            const payload: EndpointAgentListingPayload = {
                perUserRpm: input.perUserRpm,
            };
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id: crypto.randomUUID(),
                    ownerUserId: user.id,
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                    visibility: queuesPublication
                        ? "private"
                        : input.visibility,
                    pendingVisibility: queuesPublication ? "public" : null,
                    pendingAt: queuesPublication ? new Date() : null,
                    type: "endpoint_agent",
                    baseUrl: validateInputEndpointUrl(input.baseUrl),
                    upstreamModel: input.upstreamModel ?? input.name,
                    requiredSafetyFeatures: input.requiredSafetyFeatures,
                    payload: JSON.stringify(payload),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(
                toCommunityEndpointResponse(
                    row,
                    ownerGithubUsername,
                    c.env.AGENT_RUNTIME_BASE_URL,
                ),
            );
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Create My Model",
            description:
                "Register a private or public community text, image, video, transcription, or embedding model. Private is the default. Public models require an allowlisted account and become public after 3 hours. API keys require `account:keys`. The upstream bearer token is encrypted and never returned.",
            responses: {
                200: {
                    description: "Created community model",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            await ensureModelNameAvailable(db, user.id, input.name);
            const targetPolicy = deriveCreateProxyPolicy(input);
            const queuesPublication = input.visibility === "public";
            const policy = queuesPublication
                ? deriveCreateProxyPolicy({ ...input, visibility: "private" })
                : targetPolicy;
            const modelId = communityModelId(ownerGithubUsername, input.name);
            const bearerTokenCiphertext = await encryptSecret(
                normalizeInputBearerToken(input.bearerToken),
                c.env.BETTER_AUTH_SECRET,
            );
            const fallbacks = input.fallbacks
                ? await resolveFallbacks(db, input.fallbacks, {
                      modelId,
                      ownerUserId: user.id,
                      ...targetPolicy,
                  })
                : [];
            const payload: ProxyListingPayload = {
                bearerTokenCiphertext,
                ...policy,
                fallbacks,
            };
            await enforcePublishingAccess(db, user.id, input.visibility);
            const [row] = await db
                .insert(schema.communityEndpoint)
                .values({
                    id: crypto.randomUUID(),
                    ownerUserId: user.id,
                    name: input.name,
                    title: input.title,
                    description: input.description || null,
                    visibility: queuesPublication
                        ? "private"
                        : input.visibility,
                    type: "proxy",
                    baseUrl: validateInputEndpointUrl(input.baseUrl),
                    upstreamModel: input.upstreamModel ?? input.name,
                    requiredSafetyFeatures: input.requiredSafetyFeatures,
                    payload: JSON.stringify(payload),
                    pendingPayload: queuesPublication
                        ? JSON.stringify({
                              bearerTokenCiphertext,
                              ...targetPolicy,
                              fallbacks,
                          } satisfies ProxyListingPayload)
                        : null,
                    pendingVisibility: queuesPublication ? "public" : null,
                    pendingAt: queuesPublication ? new Date() : null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(
                toCommunityEndpointResponse(
                    row,
                    ownerGithubUsername,
                    c.env.AGENT_RUNTIME_BASE_URL,
                ),
            );
        },
    )
    .post(
        "/models",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "List Upstream Models",
            description:
                "Fetch OpenAI-compatible upstream model IDs from a provider before registering a My Models endpoint. Limited to one probe every 30 seconds per account. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
            tags: ["🧩 Community Models"],
            summary: "Test My Model Endpoint",
            description:
                "Test an upstream model before registering it. Image tests detect the image pricing mode and probe the derived `/images/edits` endpoint; video tests call the exact configured URL and validate completed MP4 data. Limited to one probe every 30 seconds per account. API keys require `account:keys`.",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const throttled = await enforceEndpointProbeThrottle(
                c,
                user.id,
                "test",
            );
            if (throttled) return throttled;
            try {
                const endpointInput = {
                    ...input,
                    baseUrl: validateInputEndpointUrl(input.baseUrl),
                };
                let result: CommunityEndpointTestResult;
                if (input.modality === "video") {
                    result = await testCommunityVideoEndpoint(endpointInput);
                } else {
                    if (!input.model) {
                        throw new HTTPException(400, {
                            message:
                                "model is required unless modality is video",
                        });
                    }
                    const modelInput = { ...endpointInput, model: input.model };
                    result =
                        input.modality === "image"
                            ? await testCommunityImageEndpoint(modelInput)
                            : input.modality === "transcription"
                              ? await testCommunityTranscriptionEndpoint(
                                    modelInput,
                                )
                              : input.modality === "speech"
                                ? await testCommunitySpeechEndpoint(modelInput)
                                : input.modality === "embedding"
                                  ? await testCommunityEmbeddingEndpoint(
                                        modelInput,
                                    )
                                  : await testCommunityEndpoint(modelInput);
                }
                return c.json({
                    ok: true,
                    message:
                        input.modality === "image"
                            ? result.inputModalities?.includes("image")
                                ? "Generation and editing endpoints responded with image data"
                                : "Generation endpoint responded; editing is not supported"
                            : input.modality === "video"
                              ? "Endpoint responded with playable video"
                              : input.modality === "transcription"
                                ? "Endpoint responded with transcription text"
                                : input.modality === "speech"
                                  ? "Endpoint responded with speech audio"
                                  : input.modality === "embedding"
                                    ? "Endpoint responded with embedding data"
                                    : "Endpoint responded with usage",
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
            tags: ["🧩 Community Models"],
            summary: "Update My Model",
            description:
                "Update a community model owned by the authenticated account. Changing visibility to public requires an allowlisted account and takes effect after 3 hours; public models may be free or priced. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Updated community model",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
            const ownerGithubUsername = await requireOwnerGithubUsername(
                db,
                user.id,
            );
            const endpoint = await requireOwnedEndpoint(db, id, user.id);
            // The row already owns its immutable type. Validate the external
            // body against that exact strict Zod schema instead of asking
            // every client to echo a redundant discriminator.
            assertValidUpdate(endpoint.type, input);
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
            const pendingReady = pendingCommunityEndpointChangeIsReady(
                endpoint.pendingAt,
            );
            const currentVisibility = effectiveCommunityEndpointVisibility(
                endpoint.visibility,
                endpoint.pendingVisibility,
                endpoint.pendingAt,
            );
            let pendingPayload = pendingReady ? null : endpoint.pendingPayload;
            let pendingVisibility = pendingReady
                ? null
                : endpoint.pendingVisibility;
            let pendingAt = pendingReady ? null : endpoint.pendingAt;
            if (input.name !== undefined) update.name = input.name;
            if (input.title !== undefined) update.title = input.title;
            if (input.description !== undefined) {
                update.description = input.description || null;
            }
            if (input.requiredSafetyFeatures !== undefined) {
                update.requiredSafetyFeatures = input.requiredSafetyFeatures;
            }
            if (input.hidden !== undefined) {
                if (
                    !input.hidden &&
                    (input.visibility ?? currentVisibility) === "public" &&
                    endpoint.hiddenAt &&
                    Date.now() <
                        endpoint.hiddenAt.getTime() +
                            COMMUNITY_ENDPOINT_CHANGE_DELAY_MS
                ) {
                    throw new HTTPException(400, {
                        message:
                            "Community models can be relisted 3 hours after they were hidden",
                    });
                }
                update.hiddenAt = input.hidden ? new Date() : null;
                update.hiddenReason = input.hidden ? "Hidden by owner" : null;
                update.hiddenBy = input.hidden ? "owner" : null;
            }
            await enforcePublishingAccess(
                db,
                user.id,
                input.visibility ?? currentVisibility,
            );
            let nextVisibility = currentVisibility;
            if (input.visibility === "private") {
                nextVisibility = "private";
                pendingPayload = null;
                pendingVisibility = null;
                pendingAt = null;
            } else if (
                input.visibility === "public" &&
                currentVisibility === "private"
            ) {
                pendingVisibility = "public";
                pendingAt ??= new Date();
            }
            update.visibility = nextVisibility;
            if (endpoint.type === "prompt_agent") {
                // Prompt configuration is edited through /account/agents.
                // This route only updates shared listing state such as hidden.
            } else if (endpoint.type === "endpoint_agent") {
                if (!parseListingPayload("endpoint_agent", endpoint.payload)) {
                    throw new Error(
                        `Invalid endpoint_agent payload for ${endpoint.id}`,
                    );
                }
                if (input.baseUrl !== undefined) {
                    update.baseUrl = validateInputEndpointUrl(input.baseUrl);
                }
                if (input.upstreamModel !== undefined) {
                    update.upstreamModel = input.upstreamModel;
                }
                if (input.perUserRpm !== undefined) {
                    update.payload = JSON.stringify({
                        perUserRpm: input.perUserRpm,
                    });
                }
            } else {
                const current = parseListingPayload("proxy", endpoint.payload);
                if (!current) {
                    throw new Error(`Invalid proxy payload for ${endpoint.id}`);
                }
                const stored = resolveEffectiveProxyListing({
                    visibility: endpoint.visibility,
                    payload: current,
                    pendingVisibility: endpoint.pendingVisibility,
                    pendingPayload: parseListingPayload(
                        "proxy",
                        endpoint.pendingPayload,
                    ),
                    pendingAt: endpoint.pendingAt,
                }).payload;
                const queued = parseListingPayload("proxy", pendingPayload);
                const targetBase = queued ?? stored;
                const targetVisibility = pendingVisibility ?? nextVisibility;
                const targetPolicy = deriveUpdatedProxyPolicy(
                    targetBase,
                    input,
                    targetVisibility,
                );
                const delayPricing =
                    targetVisibility === "public" &&
                    (currentVisibility === "public" ||
                        pendingVisibility === "public") &&
                    hasProxyPricingInput(input);
                const pricingChanged = proxyPricingChanged(
                    targetBase,
                    targetPolicy,
                );
                const immediateInput = delayPricing
                    ? withoutProxyPricingChanges(input)
                    : input;
                const policy = deriveUpdatedProxyPolicy(
                    stored,
                    immediateInput,
                    nextVisibility,
                );
                const fallbacks =
                    input.fallbacks === undefined
                        ? stored.fallbacks
                        : await resolveFallbacks(db, input.fallbacks, {
                              modelId: communityModelId(
                                  ownerGithubUsername,
                                  input.name ?? endpoint.name,
                              ),
                              ownerUserId: user.id,
                              ...targetPolicy,
                          });
                const bearerTokenCiphertext =
                    input.bearerToken === undefined
                        ? stored.bearerTokenCiphertext
                        : await encryptSecret(
                              normalizeInputBearerToken(input.bearerToken),
                              c.env.BETTER_AUTH_SECRET,
                          );
                if (input.baseUrl !== undefined) {
                    update.baseUrl = validateInputEndpointUrl(input.baseUrl);
                }
                if (input.upstreamModel !== undefined) {
                    update.upstreamModel = input.upstreamModel;
                }
                if (pendingReady || changesProxyPayload(input)) {
                    const payload: ProxyListingPayload = {
                        bearerTokenCiphertext,
                        ...policy,
                        fallbacks,
                    };
                    update.payload = JSON.stringify(payload);
                }
                const queuesPublication =
                    input.visibility === "public" &&
                    currentVisibility === "private";
                if ((delayPricing && pricingChanged) || queuesPublication) {
                    const targetPayload: ProxyListingPayload = {
                        bearerTokenCiphertext,
                        ...targetPolicy,
                        fallbacks,
                    };
                    pendingPayload = JSON.stringify(targetPayload);
                    if (pricingChanged) {
                        pendingAt = new Date();
                    }
                }
            }
            update.pendingPayload = pendingPayload;
            update.pendingVisibility = pendingVisibility;
            update.pendingAt = pendingAt;
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
            return c.json(
                toCommunityEndpointResponse(
                    row,
                    ownerGithubUsername,
                    c.env.AGENT_RUNTIME_BASE_URL,
                ),
            );
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["🧩 Community Models"],
            summary: "Delete My Model",
            description:
                "Delete a community model owned by the authenticated account. API keys require `account:keys`.",
            responses: {
                200: {
                    description: "Deleted community model",
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
            requireAccountPermission(c.var.auth.apiKey, "keys");
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
