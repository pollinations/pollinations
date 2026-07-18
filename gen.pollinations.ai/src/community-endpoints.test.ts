import { createExecutionContext, env, SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointRuntime,
    communityChatCompletionsUrl,
    communityEmbeddingsUrl,
    communityEndpointPrices,
    communityImageGenerationsUrl,
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
const TEST_PNG_BASE64 = "iVBORw0KGgo=";
const TEST_PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];
const TEST_INVALID_IMAGE_BASE64 = "bm90IGFuIGltYWdl";

function isPortkeyChatCompletionsRequest(request: Request): boolean {
    return new URL(request.url).pathname === "/v1/chat/completions";
}

function isCommunityImageGenerationsRequest(request: Request): boolean {
    return new URL(request.url).pathname.endsWith("/images/generations");
}

function isCommunityEmbeddingsRequest(request: Request): boolean {
    const url = new URL(request.url);
    return (
        url.hostname === "api.example.com" && url.pathname === "/v1/embeddings"
    );
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
    return (
        new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                await next();
            })
            .route("/api", frontendApi)
            // Mirror production: enter's root app registers handleError
            // (enter.pollinations.ai/src/index.ts), which maps ValidationError
            // to a 400 instead of Hono's default 500.
            .onError(handleError)
    );
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

async function expectCommunityImageGenerationsRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    expected: {
        bearerToken: string;
        body: Record<string, unknown>;
    },
): Promise<void> {
    const request = new Request(input, init);

    expect(isCommunityImageGenerationsRequest(request)).toBe(true);
    expect(request.headers.get("authorization")).toBe(
        `Bearer ${expected.bearerToken}`,
    );
    expect(request.headers.get("content-type")).toContain("application/json");
    const body = await request.json();
    expect(body).toMatchObject(expected.body);
    expect(body).not.toHaveProperty("response_format");
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
        expect(isCommunityEndpointOwnerAllowed({ githubId: 101795137 })).toBe(
            true,
        );
        expect(isCommunityEndpointOwnerAllowed({ githubId: 235942848 })).toBe(
            false,
        );
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
        expect(communityImageGenerationsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/images/generations",
        );
        expect(communityEmbeddingsUrl("https://api.example.com/v1")).toBe(
            "https://api.example.com/v1/embeddings",
        );
        expect(
            communityChatCompletionsUrl(
                "https://api.example.com/v1/chat/completions",
            ),
        ).toBe("https://api.example.com/v1/chat/completions");
        expect(
            communityImageGenerationsUrl(
                "https://api.example.com/v1/images/generations",
            ),
        ).toBe("https://api.example.com/v1/images/generations");
        expect(
            communityEmbeddingsUrl("https://api.example.com/v1/embeddings"),
        ).toBe("https://api.example.com/v1/embeddings");
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

    it("builds an embedding model definition with text input pricing", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/embedding",
            description: "Community embeddings",
            modality: "embedding",
            ...communityEndpointPrices({ promptTextPrice: 0.1 }),
        });

        expect(definition).toMatchObject({
            category: "embedding",
            inputModalities: ["text"],
            outputModalities: ["embedding"],
            cost: { promptTextTokens: 0.1 },
        });
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

    it("builds Portkey gateway context with the saved token", async () => {
        const secret = "test-secret";
        const endpoint: CommunityEndpointRuntime = {
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "voodoohop/openai",
            name: "openai",
            description: null,
            modality: "text",
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
    "a private model is owner-only and a zero-priced public model is free",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `private-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const endpointId = `endpoint-${crypto.randomUUID()}`;
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
            id: endpointId,
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

        // Publishing the same zero-priced endpoint makes it globally callable
        // without requiring a Pollinations balance.
        await db
            .update(communityEndpointTable)
            .set({ visibility: "public" })
            .where(eq(communityEndpointTable.id, endpointId));
        resetGenerationModelRegistryCache();
        const { key: zeroBalanceCallerKey } = await createTestApiKey({
            user: { tierBalance: 0, packBalance: 0 },
        });
        const freePublicResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${zeroBalanceCallerKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: "free public" }],
                }),
            }),
        );
        expect(freePublicResponse.status).toBe(200);
        await expect(freePublicResponse.json()).resolves.toMatchObject({
            choices: [{ message: { content: "ok" } }],
        });
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
    "registers an OpenAI-compatible image endpoint and exposes it through image APIs",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `image-${crypto.randomUUID().slice(0, 8)}`;
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

            if (isCommunityImageGenerationsRequest(request)) {
                const body = (await request.clone().json()) as Record<
                    string,
                    unknown
                >;
                await expectCommunityImageGenerationsRequest(input, init, {
                    bearerToken: "sk_image_upstream",
                    body: { model: "gpt-image-1", n: 1 },
                });

                if (
                    body.prompt ===
                    "A simple green sprout icon on a white background."
                ) {
                    expect(body).toMatchObject({
                        size: "1024x1024",
                        quality: "medium",
                    });
                } else if (body.prompt === "green sprout") {
                    expect(body).toMatchObject({
                        size: "512x768",
                        quality: "medium",
                        background: "transparent",
                        output_format: "png",
                    });
                } else if (body.prompt === "blue flower") {
                    expect(body).toMatchObject({
                        size: "1024x1024",
                        quality: "high",
                    });
                } else if (body.prompt !== "invalid media") {
                    throw new Error(
                        `Unexpected image prompt: ${String(body.prompt)}`,
                    );
                }

                return Response.json({
                    created: 1,
                    data: [
                        {
                            b64_json:
                                body.prompt === "invalid media"
                                    ? TEST_INVALID_IMAGE_BASE64
                                    : TEST_PNG_BASE64,
                        },
                    ],
                    usage: {
                        input_tokens: 12,
                        output_tokens: 1056,
                        total_tokens: 1068,
                        input_tokens_details: {
                            text_tokens: 12,
                            image_tokens: 0,
                        },
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
                    description: "OpenAI-compatible image endpoint",
                    modality: "image",
                    visibility: "public",
                    baseUrl: "https://api.example.com/v1/images/generations",
                    upstreamModel: "gpt-image-1",
                    bearerToken: "Bearer sk_image_upstream",
                    promptTextPrice: 0.000002,
                    completionImagePrice: 0.00003,
                }),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            id: string;
            modelId: string;
            modality: string;
            baseUrl: string;
            upstreamModel: string;
            promptTextPrice: number;
            completionImagePrice: number;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            modality: "image",
            baseUrl: "https://api.example.com/v1/images/generations",
            upstreamModel: "gpt-image-1",
            promptTextPrice: 0.000002,
            completionImagePrice: 0.00003,
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
                    bearerToken: "Bearer sk_image_upstream",
                    model: registered.upstreamModel,
                    modality: "image",
                }),
            }),
        );
        expect(testResponse.status).toBe(200);
        await expect(testResponse.json()).resolves.toMatchObject({
            message: "Endpoint responded with image data",
            usage: {
                input_tokens: 12,
                output_tokens: 1056,
                total_tokens: 1068,
            },
            billableUsage: {
                promptTextTokens: 12,
                completionImageTokens: 1056,
            },
        });

        const simpleImageResponse = await SELF.fetch(
            new Request(
                `https://gen.pollinations.ai/image/green%20sprout?model=${encodeURIComponent(
                    registered.modelId,
                )}&width=512&height=768&transparent=true`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            ),
        );
        expect(simpleImageResponse.status).toBe(200);
        expect(simpleImageResponse.headers.get("content-type")).toBe(
            "image/png",
        );
        expect(simpleImageResponse.headers.get("x-model-used")).toBe(
            registered.modelId,
        );
        expect(
            simpleImageResponse.headers.get("x-usage-prompt-text-tokens"),
        ).toBe("12");
        expect(
            simpleImageResponse.headers.get("x-usage-completion-image-tokens"),
        ).toBe("1056");
        expect(
            Array.from(new Uint8Array(await simpleImageResponse.arrayBuffer())),
        ).toEqual(TEST_PNG_BYTES);

        const openaiImageResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "blue flower",
                    size: "1024x1024",
                    quality: "hd",
                    response_format: "b64_json",
                }),
            }),
        );
        expect(openaiImageResponse.status).toBe(200);
        await expect(openaiImageResponse.json()).resolves.toMatchObject({
            data: [{ b64_json: TEST_PNG_BASE64 }],
            usage: {
                input_tokens: 12,
                output_tokens: 1056,
                total_tokens: 1068,
                input_tokens_details: {
                    text_tokens: 12,
                    image_tokens: 0,
                },
            },
        });

        const urlImageResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "blue flower",
                    response_format: "url",
                }),
            }),
        );
        expect(urlImageResponse.status).toBe(400);
        await expect(urlImageResponse.json()).resolves.toMatchObject({
            error: {
                message:
                    'Community image models support response_format "b64_json" only',
            },
        });

        const invalidMediaResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/images/generations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    prompt: "invalid media",
                }),
            }),
        );
        expect(invalidMediaResponse.status).toBe(502);

        const imageModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/image/models",
        );
        const textModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        const allModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/models",
        );
        const openaiModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/models",
        );

        expect(imageModelsResponse.status).toBe(200);
        expect(textModelsResponse.status).toBe(200);
        expect(allModelsResponse.status).toBe(200);
        expect(openaiModelsResponse.status).toBe(200);

        const imageModels = (await imageModelsResponse.json()) as {
            name: string;
            category?: string;
            community?: boolean;
            flat_rate?: boolean;
            pricing?: Record<string, string>;
        }[];
        const textModels = (await textModelsResponse.json()) as {
            name: string;
        }[];
        const allModels =
            (await allModelsResponse.json()) as typeof imageModels;
        const openaiModels = (await openaiModelsResponse.json()) as {
            data: {
                id: string;
                supported_endpoints?: string[];
            }[];
        };

        const listedImage = imageModels.find(
            (model) => model.name === registered.modelId,
        );
        expect(listedImage).toMatchObject({
            name: registered.modelId,
            category: "image",
            community: true,
            flat_rate: false,
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.000002",
                completionImageTokens: "0.00003",
            },
        });
        expect(
            textModels.find((model) => model.name === registered.modelId),
        ).toBeUndefined();
        expect(
            allModels.filter((model) => model.name === registered.modelId),
        ).toHaveLength(1);

        const openaiModel = openaiModels.data.find(
            (model) => model.id === registered.modelId,
        );
        expect(openaiModel?.supported_endpoints).toEqual(
            expect.arrayContaining([
                "/v1/images/generations",
                "/image/{prompt}",
            ]),
        );
        expect(openaiModel?.supported_endpoints).not.toContain(
            "/v1/images/edits",
        );
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isCommunityImageGenerationsRequest(new Request(input, init)),
            ),
        ).toHaveLength(4);
    },
);

fixtureTest(
    "registers an OpenAI-compatible embedding endpoint and exposes it through the embeddings API",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `embedding-${crypto.randomUUID().slice(0, 8)}`;
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

            if (isCommunityEmbeddingsRequest(request)) {
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_embedding_upstream",
                );
                const body = (await request.json()) as {
                    model: string;
                    input: string | string[];
                    encoding_format: string;
                };
                expect(body).toMatchObject({
                    model: "text-embedding-3-small",
                });
                const inputs = Array.isArray(body.input)
                    ? body.input
                    : [body.input];
                return Response.json({
                    object: "list",
                    data: inputs.map((_, index) => ({
                        object: "embedding",
                        embedding:
                            body.encoding_format === "base64"
                                ? "AAAAAA=="
                                : [index + 0.1, index + 0.2],
                        index,
                    })),
                    model: "text-embedding-3-small",
                    usage: { prompt_tokens: 6, total_tokens: 6 },
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
                    description: "OpenAI-compatible embedding endpoint",
                    modality: "embedding",
                    visibility: "public",
                    baseUrl: "https://api.example.com/v1/embeddings",
                    upstreamModel: "text-embedding-3-small",
                    bearerToken: "Bearer sk_embedding_upstream",
                    promptTextPrice: 0.000002,
                    completionTextPrice: 0.5,
                }),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            modelId: string;
            modality: string;
            baseUrl: string;
            upstreamModel: string;
            promptTextPrice: number;
            completionTextPrice: number;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            modality: "embedding",
            baseUrl: "https://api.example.com/v1/embeddings",
            upstreamModel: "text-embedding-3-small",
            promptTextPrice: 0.000002,
            completionTextPrice: 0,
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
                    bearerToken: "Bearer sk_embedding_upstream",
                    model: registered.upstreamModel,
                    modality: "embedding",
                }),
            }),
        );
        expect(testResponse.status).toBe(200);
        await expect(testResponse.json()).resolves.toMatchObject({
            message: "Endpoint responded with embedding data",
            usage: { prompt_tokens: 6, total_tokens: 6 },
            billableUsage: { promptTextTokens: 6 },
        });

        const embeddingResponse = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/embeddings", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    input: ["green sprout", "blue flower"],
                    encoding_format: "float",
                }),
            }),
        );
        expect(embeddingResponse.status).toBe(200);
        expect(embeddingResponse.headers.get("x-model-used")).toBe(
            registered.modelId,
        );
        expect(
            embeddingResponse.headers.get("x-usage-prompt-text-tokens"),
        ).toBe("6");
        await expect(embeddingResponse.json()).resolves.toMatchObject({
            object: "list",
            model: registered.modelId,
            data: [
                { object: "embedding", embedding: [0.1, 0.2], index: 0 },
                { object: "embedding", embedding: [1.1, 1.2], index: 1 },
            ],
            usage: { prompt_tokens: 6, total_tokens: 6 },
        });

        const base64Response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/embeddings", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: registered.modelId,
                    input: "green sprout",
                    encoding_format: "base64",
                }),
            }),
        );
        expect(base64Response.status).toBe(200);
        await expect(base64Response.json()).resolves.toMatchObject({
            data: [{ embedding: "AAAAAA==", index: 0 }],
        });

        const embeddingModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/embeddings/models",
        );
        const textModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        const openaiModelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/models",
        );
        expect(embeddingModelsResponse.status).toBe(200);

        const embeddingModels = (await embeddingModelsResponse.json()) as {
            name: string;
            category?: string;
            community?: boolean;
            pricing?: Record<string, string>;
        }[];
        const textModels = (await textModelsResponse.json()) as {
            name: string;
        }[];
        const openaiModels = (await openaiModelsResponse.json()) as {
            data: { id: string; supported_endpoints?: string[] }[];
        };
        expect(
            embeddingModels.find((model) => model.name === registered.modelId),
        ).toMatchObject({
            category: "embedding",
            community: true,
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.000002",
            },
        });
        expect(
            textModels.find((model) => model.name === registered.modelId),
        ).toBeUndefined();
        expect(
            openaiModels.data.find((model) => model.id === registered.modelId)
                ?.supported_endpoints,
        ).toEqual(["/v1/embeddings"]);
        expect(
            fetchMock.mock.calls.filter(([input, init]) =>
                isCommunityEmbeddingsRequest(new Request(input, init)),
            ),
        ).toHaveLength(3);
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

        // Minimum-price policy is independent of visibility: any non-negative
        // owner price is accepted by this API.
        const tinyPriceResponse = await fetchEnterApi(
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
        expect(tinyPriceResponse.status).toBe(200);
        await expect(tinyPriceResponse.json()).resolves.toMatchObject({
            promptTextPrice: 1e-12,
        });

        const negativePriceResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ promptTextPrice: -1e-12 }),
                },
            ),
        );
        expect(negativePriceResponse.status).toBe(400);

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

        // Republishing without prices is allowed: zero makes the public model
        // explicitly free while publishing remains allowlist-gated.
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
        expect(republishResponse.status).toBe(200);
        await expect(republishResponse.json()).resolves.toMatchObject({
            visibility: "public",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

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
    "accepts free and minimum public community prices while rejecting smaller positive prices",
    async () => {
        const ownerGithubUsername = `price-${crypto.randomUUID().slice(0, 8)}`;
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
        const cookie = await signedSessionCookie(sessionToken);
        const enterApi = await createEnterCommunityApi();
        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: "price-floor-test",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0,
                }),
            }),
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as {
            id: string;
            promptTextPrice: number;
        };
        expect(created.promptTextPrice).toBe(0);

        const updatePrice = (price: number) =>
            fetchEnterApi(
                enterApi,
                new Request(
                    `http://localhost:3000/api/community-endpoints/${created.id}/update`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Cookie: cookie,
                        },
                        body: JSON.stringify({ promptTextPrice: price }),
                    },
                ),
            );

        const minimumResponse = await updatePrice(
            MIN_COMMUNITY_PRICE_PER_TOKEN,
        );
        expect(minimumResponse.status).toBe(200);
        await expect(minimumResponse.json()).resolves.toMatchObject({
            promptTextPrice: MIN_COMMUNITY_PRICE_PER_TOKEN,
        });

        const belowMinimumResponse = await updatePrice(
            MIN_COMMUNITY_PRICE_PER_TOKEN / 10,
        );
        expect(belowMinimumResponse.status).toBe(400);
        expect(await belowMinimumResponse.text()).toContain(
            `${MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS} per 1M tokens`,
        );

        const negativeResponse = await updatePrice(
            -MIN_COMMUNITY_PRICE_PER_TOKEN,
        );
        expect(negativeResponse.status).toBe(400);
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
