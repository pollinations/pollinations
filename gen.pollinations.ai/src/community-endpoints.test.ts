import { createExecutionContext, env, SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointRuntime,
    communityChatCompletionsUrl,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    communityOpenAIBaseUrl,
    communityPriceDefinition,
    isCommunityEndpointOwnerAllowed,
    legacyCommunityModelId,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import {
    communityEndpoint as communityEndpointTable,
    session as sessionTable,
} from "@shared/db/better-auth.ts";
import { handleError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import {
    createTestApiKey,
    createTestUser,
    test as fixtureTest,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { resetGenerationModelRegistryCache } from "./model-registry.ts";
import { communityEndpointGatewayContext } from "./text/communityEndpoint.ts";

const db = drizzle(env.DB);
const testLog = { getChild: () => testLog } as unknown as Logger;
const COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID = 36901823;
const COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID = 999_999_999;

function isPortkeyChatCompletionsRequest(request: Request): boolean {
    return new URL(request.url).pathname === "/v1/chat/completions";
}

beforeEach(() => {
    resetGenerationModelRegistryCache();
});

afterEach(() => {
    resetGenerationModelRegistryCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function createEnterCommunityApi(): Promise<Hono<Env>> {
    const routePath =
        "../../enter.pollinations.ai/src/routes/community-endpoints.ts";
    const { communityEndpointsRoutes } = (await import(routePath)) as {
        communityEndpointsRoutes: Hono;
    };
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            await next();
        })
        .route("/api/community-endpoints", communityEndpointsRoutes)
        .onError(handleError);
}

async function createEnterFrontendApi(): Promise<Hono<Env>> {
    const routePath = "../../enter.pollinations.ai/src/frontend-api.ts";
    const { frontendApi } = (await import(routePath)) as {
        frontendApi: Hono;
    };
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            await next();
        })
        .route("/api", frontendApi)
        // Mirror production: enter's root app registers handleError
        // (enter.pollinations.ai/src/index.ts), which maps ValidationError
        // to a 400 instead of Hono's default 500.
        .onError(handleError);
}

async function fetchEnterApi(
    app: Hono<Env>,
    request: Request,
): Promise<Response> {
    const ctx = createExecutionContext();
    return app.fetch(request, env, ctx);
}

async function signedSessionCookie(token: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.BETTER_AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(token),
    );
    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    );
    return `better-auth.session_token=${encodeURIComponent(`${token}.${encodedSignature}`)}`;
}

async function expectCommunityPortkeyRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    expected: {
        customHost: string;
        bearerToken: string;
        upstreamModel: string;
        body: Record<string, unknown>;
    },
): Promise<void> {
    const request = new Request(input, init);

    expect(isPortkeyChatCompletionsRequest(request)).toBe(true);
    expect(request.headers.get("authorization")).toBe(
        `Bearer ${expected.bearerToken}`,
    );
    expect(request.headers.get("x-portkey-provider")).toBe("openai");
    expect(request.headers.get("x-portkey-custom-host")).toBe(
        expected.customHost,
    );
    expect(request.headers.get("x-portkey-model")).toBe(expected.upstreamModel);
    expect(request.headers.get("x-portkey-strict-open-ai-compliance")).toBe(
        "false",
    );
    await expect(request.json()).resolves.toMatchObject({
        model: expected.upstreamModel,
        ...expected.body,
    });
}

function isBillingFetch(request: Request): boolean {
    return (
        request.url.startsWith("https://api.europe-west2.gcp.tinybird.co/") ||
        request.url.startsWith("http://localhost:7181/")
    );
}

describe("community endpoint helpers", () => {
    it("checks the community endpoint owner GitHub ID allowlist", () => {
        expect(
            isCommunityEndpointOwnerAllowed({
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            }),
        ).toBe(true);
        expect(
            isCommunityEndpointOwnerAllowed({
                githubId: COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID,
            }),
        ).toBe(false);
        expect(isCommunityEndpointOwnerAllowed({ githubId: null })).toBe(false);
    });

    it("normalizes bearer tokens with or without the scheme", () => {
        expect(normalizeCommunityEndpointBearerToken("sk_test")).toBe(
            "sk_test",
        );
        expect(
            normalizeCommunityEndpointBearerToken("  Bearer sk_test  "),
        ).toBe("sk_test");
        expect(() => normalizeCommunityEndpointBearerToken("Bearer ")).toThrow(
            "API bearer token is required",
        );
    });

    it("round-trips community model ids", () => {
        const modelId = communityModelId(
            "voodoohop",
            "provider/path/model-name",
        );
        const legacyModelId = legacyCommunityModelId(
            "voodoohop",
            "provider/path/model-name",
        );

        expect(modelId).toBe("voodoohop/provider/path/model-name");
        expect(legacyModelId).toBe(
            "community/voodoohop/provider/path/model-name",
        );
        expect(parseCommunityModelId(modelId)).toEqual({
            ownerGithubUsername: "voodoohop",
            modelName: "provider/path/model-name",
        });
        expect(parseCommunityModelId(legacyModelId)).toEqual({
            ownerGithubUsername: "voodoohop",
            modelName: "provider/path/model-name",
        });
        expect(parseCommunityModelId("openai")).toBeNull();
    });

    it("normalizes OpenAI-compatible endpoint URLs", () => {
        expect(
            normalizeCommunityEndpointBaseUrl("https://api.example.com/v1/"),
        ).toBe("https://api.example.com/v1");
        expect(
            normalizeCommunityEndpointBaseUrl(
                "https://api.example.com/v1?ignored=1#section",
            ),
        ).toBe("https://api.example.com/v1");
        expect(communityChatCompletionsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/chat/completions",
        );
        expect(
            communityChatCompletionsUrl(
                "https://api.example.com/v1/chat/completions",
            ),
        ).toBe("https://api.example.com/v1/chat/completions");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("http://api.example.com/v1"),
        ).toThrow("Endpoint URL must use https");
        expect(() =>
            normalizeCommunityEndpointBaseUrl("https://localhost/v1"),
        ).toThrow("Endpoint URL cannot target a private host");
    });

    it("uses the community endpoint description as the model title", () => {
        const modelDefinition = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: "OpenAI via community endpoint",
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        });

        expect(modelDefinition.title).toBe("OpenAI via community endpoint");
        expect(modelDefinition.aliases).toEqual(["community/voodoohop/openai"]);
        expect(modelDefinition.description).toBe(
            "OpenAI via community endpoint",
        );
    });

    it("keeps zero prices as explicit zero rates in the price definition", () => {
        const definition = communityPriceDefinition(
            communityEndpointPrices({ promptTextPrice: 0.5 }),
        );

        expect(definition.promptTextTokens).toBe(0.5);
        expect(definition.completionTextTokens).toBe(0);
        // Every usage type gets an explicit rate, so billing never treats an
        // intentionally-free bucket as a missing conversion rate.
        expect(Object.keys(definition)).toHaveLength(
            COMMUNITY_ENDPOINT_PRICE_FIELDS.length,
        );
    });

    it("keeps the per-token and per-1M minimum price constants in sync", () => {
        expect(MIN_COMMUNITY_PRICE_PER_TOKEN * 1_000_000).toBeCloseTo(
            MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
            10,
        );
    });

    it("builds Portkey gateway context with the saved token", async () => {
        const secret = "test-secret";
        const endpoint: CommunityEndpointRuntime = {
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "voodoohop/openai",
            name: "openai",
            description: null,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            visibility: "public",
            disabledAt: null,
            disabledReason: null,
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                secret,
            ),
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        };
        const modelDefinition = communityModelDefinition(endpoint);

        const context = await communityEndpointGatewayContext(
            endpoint,
            modelDefinition,
            {
                messages: [{ role: "user", content: "hello" }],
                max_tokens: 5,
            },
            secret,
            "https://portkey.test",
            "sk_user_key",
        );

        expect(context).toMatchObject({
            max_tokens: 5,
            requestedModel: endpoint.modelId,
            portkeyGatewayUrl: "https://portkey.test",
            userApiKey: "sk_user_key",
            modelConfig: {
                provider: "openai",
                "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
                authKey: "sk_saved_token",
                model: "gpt-4.1-mini",
            },
        });
        expect(context.modelDef).toBe(modelDefinition);
        expect(context).not.toHaveProperty("messages");
    });
});

fixtureTest(
    "routes chat completions through a registered community endpoint with its saved token",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `openai-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "OpenAI via community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "Bearer sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    upstreamModel: "gpt-4.1-mini",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: false,
                    },
                });

                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(modelId);
        const body = await response.json();
        expect(body).not.toHaveProperty("model");
        expect(body).toMatchObject({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        });

        const legacyResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: legacyCommunityModelId(
                        ownerGithubUsername,
                        modelName,
                    ),
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );
        expect(legacyResponse.status).toBe(200);
        const legacyBody = await legacyResponse.json();
        expect(legacyBody).not.toHaveProperty("model");
        expect(legacyBody).toMatchObject({
            choices: [{ message: { content: "ok" } }],
        });

        const upstreamCalls = fetchMock.mock.calls.filter(([input, init]) =>
            isPortkeyChatCompletionsRequest(new Request(input, init)),
        );
        expect(upstreamCalls).toHaveLength(2);
    },
);

fixtureTest(
    "a private community model is callable by its owner but not by other callers",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `private-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
            // Owner-only private models have no Pollinations charge and remain
            // callable without a Pollinations balance.
            tierBalance: 0,
        });
        // A key belonging to the endpoint owner — its calls are owner calls.
        const { key: ownerApiKey } = await createTestApiKey({
            name: "owner-key",
            userId: ownerUserId,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "private",
            name: modelName,
            description: "Private community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "Bearer sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            // A private endpoint is free (billed to its owner); prices are 0.
            promptTextPrice: 0,
            completionTextPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (isPortkeyChatCompletionsRequest(request)) {
                return Response.json({
                    id: "chatcmpl_private",
                    object: "chat.completion",
                    model: "gpt-4.1-mini",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }
            if (isBillingFetch(request)) return Response.json({ data: [] });
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        // A non-owner caller: the private model resolves to "invalid model",
        // indistinguishable from an unknown name so it isn't discoverable.
        const otherResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(otherResponse.status).toBe(400);

        // The owner reaches their own private model.
        const ownerResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${ownerApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(ownerResponse.status).toBe(200);
        await expect(ownerResponse.json()).resolves.toMatchObject({
            choices: [{ message: { content: "ok" } }],
        });

        const catalogIncludesModel = async (authorization?: string) => {
            const modelsResponse = await SELF.fetch(
                new Request("https://gen.pollinations.ai/text/models", {
                    headers: authorization
                        ? { Authorization: `Bearer ${authorization}` }
                        : undefined,
                }),
            );
            expect(modelsResponse.status).toBe(200);
            const models = (await modelsResponse.json()) as { name: string }[];
            return models.some((model) => model.name === modelId);
        };

        // The owner's authenticated catalog includes the private model, while
        // anonymous and other authenticated callers cannot discover it.
        await expect(catalogIncludesModel(ownerApiKey)).resolves.toBe(true);
        await expect(catalogIncludesModel(apiKey)).resolves.toBe(false);
        await expect(catalogIncludesModel()).resolves.toBe(false);
    },
);

fixtureTest(
    "streams chat completions through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `stream-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Streaming community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (isPortkeyChatCompletionsRequest(request)) {
                    await expectCommunityPortkeyRequest(input, init, {
                        customHost: "https://api.example.com/v1",
                        bearerToken: "sk_saved_token",
                        upstreamModel: "gpt-4.1-mini",
                        body: {
                            messages: [{ role: "user", content: "hello" }],
                            max_tokens: 5,
                            stream: true,
                            stream_options: { include_usage: true },
                        },
                    });

                    return new Response(
                        [
                            'data: {"id":"upstream","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}',
                            "",
                            'data: {"id":"upstream","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[],"usage":{"prompt_tokens":999,"completion_tokens":999,"total_tokens":1998}}',
                            "",
                            "data: [DONE]",
                            "",
                        ].join("\n"),
                        {
                            headers: {
                                "Content-Type": "text/event-stream",
                            },
                        },
                    );
                }

                if (isBillingFetch(request)) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                    stream: true,
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const body = await response.text();
        expect(body).toContain('"model":"gpt-4.1-mini"');
        expect(body).not.toContain(`"model":"${modelId}"`);
        expect(body).toContain('"prompt_tokens":999');
        expect(body).toContain('"completion_tokens":999');
    },
);

fixtureTest(
    "routes simple text requests through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `simple-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Simple text community endpoint",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (isPortkeyChatCompletionsRequest(request)) {
                    await expectCommunityPortkeyRequest(input, init, {
                        customHost: "https://api.example.com/v1",
                        bearerToken: "sk_saved_token",
                        upstreamModel: "gpt-4.1-mini",
                        body: {
                            messages: [{ role: "user", content: "hello" }],
                            max_tokens: 5,
                            stream: false,
                        },
                    });

                    return Response.json({
                        id: "chatcmpl_simple",
                        object: "chat.completion",
                        model: "gpt-4.1-mini",
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: "simple ok",
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 3,
                            total_tokens: 5,
                        },
                    });
                }

                if (isBillingFetch(request)) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await SELF.fetch(
            new Request(
                `https://gen.pollinations.ai/text/hello?model=${encodeURIComponent(
                    modelId,
                )}&max_tokens=5&stream=false`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(
            IMMUTABLE_CACHE_CONTROL,
        );
        expect(response.headers.get("x-cache")).toBe("MISS");
        expect(response.headers.get("x-cache-key")).toBeTruthy();
        await expect(response.text()).resolves.toBe("simple ok");
    },
);

fixtureTest(
    "lists registered community endpoints in public model catalogs",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `catalog-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Public community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const textResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        const allResponse = await SELF.fetch(
            "https://gen.pollinations.ai/models",
        );
        const openaiResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/models",
        );

        expect(textResponse.status).toBe(200);
        expect(allResponse.status).toBe(200);
        expect(openaiResponse.status).toBe(200);

        const textModels = (await textResponse.json()) as {
            name: string;
            aliases?: string[];
            category?: string;
            community?: boolean;
            alpha?: boolean;
            description?: string;
            pricing?: Record<string, string>;
            baseUrl?: string;
            bearerTokenCiphertext?: string;
        }[];
        const allModels = (await allResponse.json()) as typeof textModels;
        const openaiModels = (await openaiResponse.json()) as {
            data: {
                id: string;
                supported_endpoints?: string[];
            }[];
        };

        for (const models of [textModels, allModels]) {
            const listed = models.find((model) => model.name === modelId);
            expect(listed).toMatchObject({
                name: modelId,
                aliases: [
                    legacyCommunityModelId(ownerGithubUsername, modelName),
                ],
                category: "text",
                community: true,
                alpha: true,
                title: "Public community model",
                description: "Public community model",
                pricing: {
                    currency: "pollen",
                    promptTextTokens: "0.0000001",
                    completionTextTokens: "0.0000002",
                },
            });
            expect(listed).not.toHaveProperty("baseUrl");
            expect(listed).not.toHaveProperty("bearerTokenCiphertext");
        }

        expect(openaiModels.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: modelId,
                    supported_endpoints: expect.arrayContaining([
                        "/v1/chat/completions",
                    ]),
                }),
            ]),
        );
    },
);

fixtureTest(
    "excludes a deactivated community model from public model catalogs",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `disabled-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Deactivated community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            disabledAt: new Date(),
            disabledReason: "repeated upstream 500s",
            disabledBy: "monitor",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const textResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        const allResponse = await SELF.fetch(
            "https://gen.pollinations.ai/models",
        );
        const openaiResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/models",
        );

        const textModels = (await textResponse.json()) as { name: string }[];
        const allModels = (await allResponse.json()) as typeof textModels;
        const openaiModels = (await openaiResponse.json()) as {
            data: { id: string }[];
        };

        for (const models of [textModels, allModels]) {
            expect(
                models.find((model) => model.name === modelId),
            ).toBeUndefined();
        }
        expect(
            openaiModels.data.find((model) => model.id === modelId),
        ).toBeUndefined();
    },
);

fixtureTest(
    "rejects a direct chat completion against a deactivated community model",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `disabled-call-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const legacyModelId = legacyCommunityModelId(
            ownerGithubUsername,
            modelName,
        );
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Deactivated community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1 / 1_000_000,
            completionTextPrice: 0.2 / 1_000_000,
            disabledAt: new Date(),
            disabledReason: "repeated upstream 500s",
            disabledBy: "monitor",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        for (const requestedModel of [modelId, legacyModelId]) {
            const response = await SELF.fetch(
                "https://gen.pollinations.ai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: requestedModel,
                        messages: [{ role: "user", content: "hello" }],
                        stream: false,
                    }),
                },
            );

            expect(response.status).toBe(400);
            const body = (await response.json()) as {
                error?: { message?: string };
            };
            expect(body.error?.message).toContain("Invalid model or alias");
            expect(body.error?.message).not.toContain("repeated upstream 500s");
        }
    },
);

fixtureTest(
    "lets a non-allowlisted user register a private model but blocks publishing tools",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `denied-${crypto.randomUUID().slice(0, 8)}`;
        const privateModelName = `${modelName}-private`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_DENIED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        for (const probe of [
            {
                path: "models",
                body: {
                    baseUrl: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                },
            },
            {
                path: "test",
                body: {
                    baseUrl: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    model: "gpt-4.1-mini",
                },
            },
        ]) {
            const probeResponse = await fetchEnterApi(
                enterApi,
                new Request(
                    `http://localhost:3000/api/community-endpoints/${probe.path}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Cookie: await signedSessionCookie(sessionToken),
                        },
                        body: JSON.stringify(probe.body),
                    },
                ),
            );
            expect(probeResponse.status).toBe(403);
        }

        const directPublishResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: `${modelName}-direct-public`,
                    description: "Denied public community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.1,
                }),
            }),
        );
        expect(directPublishResponse.status).toBe(403);

        // Creation is open to everyone: a non-allowlisted user can register a
        // private model for their own use.
        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: privateModelName,
                    description: "Private community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                }),
            }),
        );
        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            visibility: string;
            promptTextPrice: number;
            completionTextPrice: number;
        };
        expect(registered).toMatchObject({
            visibility: "private",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        // Publishing is a separate, allowlist-gated action.
        const publishResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${registered.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: await signedSessionCookie(sessionToken),
                    },
                    body: JSON.stringify({
                        visibility: "public",
                        promptTextPrice: 0.1,
                        completionTextPrice: 0.1,
                    }),
                },
            ),
        );
        expect(publishResponse.status).toBe(403);

        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: modelName,
            description: "Denied community model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://api.example.com/v1",
                    bearerToken: "sk_saved_token",
                    upstreamModel: "gpt-4.1-mini",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                    },
                });

                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    model: "gpt-4.1-mini",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const modelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        expect(modelsResponse.status).toBe(200);
        const models = (await modelsResponse.json()) as { name: string }[];
        expect(models.some((model) => model.name === modelId)).toBe(true);

        const generationResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
        );
        expect(generationResponse.status).toBe(200);
        await expect(generationResponse.json()).resolves.toMatchObject({
            model: "gpt-4.1-mini",
            choices: [
                {
                    message: { content: "ok" },
                },
            ],
        });
    },
);

fixtureTest(
    "registers a Pollinations-compatible endpoint through Enter API and uses it through gen",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `pollinations-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: ownerGithubUsername,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (isPortkeyChatCompletionsRequest(request)) {
                const isPortkeyRequest =
                    request.headers.has("x-portkey-provider");
                if (!isPortkeyRequest) {
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer sk_pollinations_upstream",
                    );
                    await expect(request.json()).resolves.toMatchObject({
                        model: "openai",
                        messages: [{ role: "user", content: "Reply with OK." }],
                        stream: false,
                    });
                    return Response.json({
                        id: "chatcmpl_pollinations_upstream_test",
                        object: "chat.completion",
                        model: "openai",
                        choices: [
                            {
                                index: 0,
                                message: { role: "assistant", content: "OK" },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 3,
                            total_tokens: 5,
                        },
                    });
                }

                await expectCommunityPortkeyRequest(input, init, {
                    customHost: "https://gen.pollinations.ai/v1",
                    bearerToken: "sk_pollinations_upstream",
                    upstreamModel: "openai",
                    body: {
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: false,
                    },
                });

                return Response.json({
                    id: "chatcmpl_pollinations_upstream",
                    object: "chat.completion",
                    model: "openai",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 3,
                        total_tokens: 5,
                    },
                });
            }

            if (isBillingFetch(request)) {
                return Response.json({ data: [] });
            }

            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const registerResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: modelName,
                    description: "Pollinations upstream through community API",
                    baseUrl: "https://gen.pollinations.ai/v1",
                    upstreamModel: "openai",
                    bearerToken: "Bearer sk_pollinations_upstream",
                    visibility: "public",
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.1,
                }),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            modelId: string;
            baseUrl: string;
            upstreamModel: string;
            visibility: string;
            promptTextPrice: number;
            completionTextPrice: number;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            baseUrl: "https://gen.pollinations.ai/v1",
            upstreamModel: "openai",
            visibility: "public",
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
        });

        const testResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: registered.baseUrl,
                    bearerToken: "Bearer sk_pollinations_upstream",
                    model: registered.upstreamModel,
                }),
            }),
        );
        expect(testResponse.status).toBe(200);
        await expect(testResponse.json()).resolves.toMatchObject({
            message: "Endpoint responded with usage",
            billableUsage: {
                promptTextTokens: 2,
                completionTextTokens: 3,
            },
        });

        const throttledTestResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: registered.baseUrl,
                    bearerToken: "Bearer sk_pollinations_upstream",
                    model: registered.upstreamModel,
                }),
            }),
        );
        expect(throttledTestResponse.status).toBe(429);
        expect(throttledTestResponse.headers.get("Retry-After")).toBe("30");
        await expect(throttledTestResponse.json()).resolves.toMatchObject({
            error: "rate_limited",
        });

        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            model: "openai",
            choices: [{ message: { content: "ok" } }],
        });
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isPortkeyChatCompletionsRequest(new Request(input, init)),
            ),
        ).toHaveLength(2);
    },
);

fixtureTest(
    "manages my-models through account API with a key that has account keys permission",
    async () => {
        const ownerGithubUsername = `pk-${crypto.randomUUID().slice(0, 8)}`;
        const { key } = await createTestApiKey({
            type: "publishable",
            accountPermissions: ["keys"],
            user: {
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
                githubUsername: ownerGithubUsername,
            },
        });
        const denied = await createTestApiKey({
            user: {
                githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
                githubUsername: `denied-${crypto.randomUUID().slice(0, 8)}`,
            },
        });
        const enterApi = await createEnterFrontendApi();

        const legacyResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(legacyResponse.status).toBe(404);

        const deniedResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${denied.key}`,
                },
            }),
        );
        expect(deniedResponse.status).toBe(403);

        const listResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(listResponse.status).toBe(200);
        await expect(listResponse.json()).resolves.toEqual({ data: [] });

        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "my-test-model",
                    description: "Account API model",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                }),
            }),
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as Record<
            string,
            unknown
        >;
        expect(created).toMatchObject({
            modelId: `${ownerGithubUsername}/my-test-model`,
            name: "my-test-model",
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            visibility: "private",
            promptTextPrice: 0,
            completionTextPrice: 0,
            disabled: false,
            disabledReason: null,
            disabledAt: null,
        });
        expect(created).not.toHaveProperty("bearerToken");
        expect(created).not.toHaveProperty("bearerTokenCiphertext");
        expect(typeof created.id).toBe("string");
        const createdId = created.id as string;
        await db
            .update(communityEndpointTable)
            .set({
                disabledAt: new Date(),
                disabledReason: "was failing",
                disabledBy: "monitor",
            })
            .where(eq(communityEndpointTable.id, createdId));

        const updateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        description: "Updated description",
                        visibility: "public",
                        promptTextPrice: 0.1,
                        completionTextPrice: 0.2,
                    }),
                },
            ),
        );
        expect(updateResponse.status).toBe(200);
        await expect(updateResponse.json()).resolves.toMatchObject({
            description: "Updated description",
            visibility: "public",
            promptTextPrice: 0.1,
            completionTextPrice: 0.2,
            disabled: true,
            disabledReason: "was failing",
        });

        // A nonzero price below the platform minimum (0.0001 Pollen per 1M
        // tokens, stored per token) is rejected at the schema level.
        const belowMinimumResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: 1e-12 }),
                },
            ),
        );
        expect(belowMinimumResponse.status).toBe(400);

        // Partial updates persist the full effective visibility + price set,
        // so a price-only patch keeps the other stored prices intact.
        const priceOnlyResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: 0.3 }),
                },
            ),
        );
        expect(priceOnlyResponse.status).toBe(200);
        await expect(priceOnlyResponse.json()).resolves.toMatchObject({
            visibility: "public",
            promptTextPrice: 0.3,
            completionTextPrice: 0.2,
        });

        // Making the model private clears all owner-set prices.
        const privatizeResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ visibility: "private" }),
                },
            ),
        );
        expect(privatizeResponse.status).toBe(200);
        await expect(privatizeResponse.json()).resolves.toMatchObject({
            visibility: "private",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        // Republishing without prices must fail: the cleared prices no longer
        // satisfy the public-requires-pricing rule.
        const republishResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ visibility: "public" }),
                },
            ),
        );
        expect(republishResponse.status).toBe(400);

        const secondListResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/account/my-models", {
                headers: {
                    Authorization: `Bearer ${key}`,
                },
            }),
        );
        expect(secondListResponse.status).toBe(200);
        const secondList = (await secondListResponse.json()) as {
            data: Record<string, unknown>[];
        };
        expect(secondList.data).toHaveLength(1);
        expect(secondList.data[0]).not.toHaveProperty("bearerToken");
        expect(secondList.data[0]).not.toHaveProperty("bearerTokenCiphertext");
    },
);

fixtureTest(
    "rejects an endpoint probe when the upstream responds with a redirect",
    async () => {
        // Use an approved publisher so the request reaches the outbound probe;
        // non-allowlisted accounts are rejected before any fetch occurs.
        const ownerUserId = await createTestUser({
            githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
            githubUsername: `redir-${crypto.randomUUID().slice(0, 8)}`,
        });
        const sessionToken = `session-${crypto.randomUUID()}`;
        await db.insert(sessionTable).values({
            id: `session-${crypto.randomUUID()}`,
            token: sessionToken,
            userId: ownerUserId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const enterApi = await createEnterCommunityApi();
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            if (
                request.url ===
                "https://redirecting.example.com/v1/chat/completions"
            ) {
                // The redirect target never went through base-URL validation,
                // so the probe must not follow it.
                expect(init?.redirect).toBe("manual");
                return new Response(null, {
                    status: 302,
                    headers: { Location: "http://127.0.0.1/admin" },
                });
            }
            throw new Error(`Unexpected fetch: ${request.url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const testResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints/test", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    baseUrl: "https://redirecting.example.com/v1",
                    bearerToken: "Bearer sk_upstream",
                    model: "gpt-test",
                }),
            }),
        );

        expect(testResponse.status).toBe(400);
        expect(await testResponse.text()).toContain("redirect");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    },
);

fixtureTest("rejects a community model name containing a slash", async () => {
    const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({
        githubId: COMMUNITY_ENDPOINT_ALLOWED_TEST_GITHUB_ID,
        githubUsername: ownerGithubUsername,
    });
    const sessionToken = `session-${crypto.randomUUID()}`;
    await db.insert(sessionTable).values({
        id: `session-${crypto.randomUUID()}`,
        token: sessionToken,
        userId: ownerUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const enterApi = await createEnterCommunityApi();
    const response = await fetchEnterApi(
        enterApi,
        new Request("http://localhost:3000/api/community-endpoints", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: await signedSessionCookie(sessionToken),
            },
            body: JSON.stringify({
                name: "inferenceport.ai/gpt-oss-20b",
                description: "name with a slash",
                baseUrl: "https://api.example.com/v1",
                upstreamModel: "gpt-oss-20b",
                bearerToken: "sk_saved_token",
            }),
        }),
    );

    expect(response.status).toBe(400);
});
