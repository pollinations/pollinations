import { createExecutionContext, env, SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import {
    type CommunityEndpointRuntime,
    communityChatCompletionsUrl,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    communityOpenAIBaseUrl,
    isCommunityEndpointOwnerAllowed,
    legacyCommunityModelId,
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
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
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
        .route("/api", frontendApi);
}

async function fetchEnterApi(
    app: Hono<Env>,
    request: Request,
    envOverride: typeof env = env,
): Promise<Response> {
    const ctx = createExecutionContext();
    return app.fetch(request, envOverride, ctx);
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

    it("maps declared capability flags into the model definition", () => {
        const agentDefinition = communityModelDefinition({
            modelId: "voodoohop/deep-research",
            description: "Agentic community endpoint",
            tools: true,
            search: true,
            reasoning: false,
            ...communityEndpointPrices({}),
        });
        expect(agentDefinition.tools).toBe(true);
        expect(agentDefinition.search).toBe(true);
        expect(agentDefinition.reasoning).toBeUndefined();

        const modelDefinition = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: null,
            ...communityEndpointPrices({}),
        });
        expect(modelDefinition.tools).toBeUndefined();
        expect(modelDefinition.search).toBeUndefined();
        expect(modelDefinition.reasoning).toBeUndefined();
    });

    it("bills owner-declared tool fees from reported tool_call_counts", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/deep-research",
            description: null,
            toolPrices: { web_search: 0.005, code_exec: 0.03 },
            ...communityEndpointPrices({ completionTextPrice: 0.000001 }),
        });
        expect(definition.billing?.adjustments?.map((a) => a.id)).toEqual([
            "community.tool.code_exec.v1",
            "community.tool.web_search.v1",
        ]);

        // Non-stream: counts read from the response usage object; undeclared
        // tools in the report are ignored.
        const billing = calculateUsageBilling(
            "voodoohop/deep-research",
            { completionTextTokens: 10 },
            definition,
            {
                usage: {
                    tool_call_counts: {
                        web_search: 3,
                        code_exec: 1,
                        undeclared: 5,
                    },
                },
            },
        );
        expect(billing.adjustments).toHaveLength(2);
        expect(billing.price.totalPrice).toBeCloseTo(
            10 * 0.000001 + 3 * 0.005 + 1 * 0.03,
            10,
        );

        // Stream: counts read from the last usage-bearing stream event.
        const streamed = calculateUsageBilling(
            "voodoohop/deep-research",
            { completionTextTokens: 10 },
            definition,
            {
                streamEvents: [
                    { choices: [{ delta: { content: "ok" } }] },
                    { usage: { tool_call_counts: { web_search: 2 } } },
                ],
            },
        );
        expect(streamed.adjustments).toEqual([
            expect.objectContaining({
                ruleId: "community.tool.web_search.v1",
                units: 2,
                cost: 0.01,
            }),
        ]);

        // Malformed counts bill as 0 and never throw.
        const malformed = calculateUsageBilling(
            "voodoohop/deep-research",
            { completionTextTokens: 10 },
            definition,
            { usage: { tool_call_counts: { web_search: "three" } } },
        );
        expect(malformed.adjustments).toHaveLength(0);

        // No declared tools → no billing rules at all.
        const plain = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: null,
            toolPrices: {},
            ...communityEndpointPrices({}),
        });
        expect(plain.billing).toBeUndefined();
    });

    it("surfaces billing adjustments as fees in catalog model info", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/deep-research",
            description: null,
            toolPrices: { web_search: 0.005 },
            ...communityEndpointPrices({ completionTextPrice: 0.000001 }),
        });
        const info = modelInfoFromDefinition(
            "voodoohop/deep-research",
            definition,
            { community: true },
        );
        expect(info.fees).toEqual([
            {
                id: "community.tool.web_search.v1",
                kind: "tool_call",
                unit: "call",
                price: "0.005",
                description: expect.stringContaining("web_search"),
            },
        ]);

        const plain = communityModelDefinition({
            modelId: "voodoohop/openai",
            description: null,
            ...communityEndpointPrices({}),
        });
        expect(
            modelInfoFromDefinition("voodoohop/openai", plain).fees,
        ).toBeUndefined();
    });

    it("marks resolver-priced fees dynamic and omits their static price", () => {
        const definition = communityModelDefinition({
            modelId: "voodoohop/deep-research",
            description: null,
            ...communityEndpointPrices({}),
        });
        // A rule whose per-unit cost is read from the response at runtime
        // (as Perplexity's request fee is) must not advertise a static price.
        definition.billing = {
            adjustments: [
                {
                    id: "provider.request.v1",
                    description: "Provider-reported request cost",
                    kind: "search_request",
                    unit: "request",
                    unitCost: 0.005,
                    countUnits: () => 1,
                    resolveUnitCost: () => 0.02,
                },
            ],
        };
        const info = modelInfoFromDefinition(
            "voodoohop/deep-research",
            definition,
            { community: true },
        );
        expect(info.fees).toEqual([
            {
                id: "provider.request.v1",
                kind: "search_request",
                unit: "request",
                dynamic: true,
                description: "Provider-reported request cost",
            },
        ]);
        expect(info.fees?.[0]).not.toHaveProperty("price");
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
            tools: false,
            search: false,
            reasoning: false,
            toolPrices: {},
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

        // And it never appears in the public catalog.
        const modelsResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text/models",
        );
        const models = (await modelsResponse.json()) as { name: string }[];
        expect(models.some((model) => model.name === modelId)).toBe(false);
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
        const agentModelName = `agent-${crypto.randomUUID().slice(0, 8)}`;
        const agentModelId = communityModelId(
            ownerGithubUsername,
            agentModelName,
        );
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
            visibility: "public",
            name: agentModelName,
            description: "Public community agent",
            baseUrl: "https://agent.example.com/v1",
            upstreamModel: "agent-loop",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                env.BETTER_AUTH_SECRET,
            ),
            tools: true,
            search: true,
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
            tools?: boolean;
            capabilities?: string[];
            baseUrl?: string;
            bearerTokenCiphertext?: string;
        }[];
        const allModels = (await allResponse.json()) as typeof textModels;
        const openaiModels = (await openaiResponse.json()) as {
            data: {
                id: string;
                supported_endpoints?: string[];
                tools?: boolean;
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

            const listedAgent = models.find(
                (model) => model.name === agentModelId,
            );
            expect(listedAgent).toMatchObject({
                name: agentModelId,
                community: true,
                tools: true,
                capabilities: expect.arrayContaining([
                    "tool_calling",
                    "web_search",
                ]),
            });
        }

        expect(openaiModels.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: modelId,
                    supported_endpoints: expect.arrayContaining([
                        "/v1/chat/completions",
                    ]),
                }),
                expect.objectContaining({
                    id: agentModelId,
                    tools: true,
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
    "lets a non-allowlisted user register a private model but blocks publishing it",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `denied-${crypto.randomUUID().slice(0, 8)}`;
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
                    name: `${modelName}-private`,
                    description: "Private community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                }),
            }),
        );
        expect(registerResponse.status).toBe(200);

        // But sharing (public) is allowlist-gated: the same denied user is
        // rejected when they try to register a public model.
        const publishResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: await signedSessionCookie(sessionToken),
                },
                body: JSON.stringify({
                    name: modelName,
                    description: "Denied community endpoint",
                    baseUrl: "https://api.example.com/v1",
                    upstreamModel: "gpt-4.1-mini",
                    bearerToken: "sk_saved_token",
                    visibility: "public",
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.1,
                }),
            }),
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
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            baseUrl: "https://gen.pollinations.ai/v1",
            upstreamModel: "openai",
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
                    tools: true,
                    toolPrices: { web_search: 0.005 },
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.2,
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
            tools: true,
            search: false,
            reasoning: false,
            toolPrices: { web_search: 0.005 },
            promptTextPrice: 0.1,
            completionTextPrice: 0.2,
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
                        tools: false,
                        search: true,
                        toolPrices: { web_search: 0.01, fetch_url: 0.0005 },
                    }),
                },
            ),
        );
        expect(updateResponse.status).toBe(200);
        await expect(updateResponse.json()).resolves.toMatchObject({
            description: "Updated description",
            tools: false,
            search: true,
            reasoning: false,
            toolPrices: { web_search: 0.01, fetch_url: 0.0005 },
            promptTextPrice: 0.1,
            completionTextPrice: 0.2,
            disabled: true,
            disabledReason: "was failing",
        });

        const clearToolPricesResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/account/my-models/${createdId}/update`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ toolPrices: {} }),
                },
            ),
        );
        expect(clearToolPricesResponse.status).toBe(200);
        await expect(clearToolPricesResponse.json()).resolves.toMatchObject({
            toolPrices: {},
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

fixtureTest(
    "rejects community registration unless exactly one of baseUrl or source is provided",
    async () => {
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
        const cookie = await signedSessionCookie(sessionToken);
        const register = (body: Record<string, unknown>) =>
            fetchEnterApi(
                enterApi,
                new Request("http://localhost:3000/api/community-endpoints", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: cookie,
                    },
                    body: JSON.stringify({
                        name: `bee-${crypto.randomUUID().slice(0, 8)}`,
                        bearerToken: "sk_saved_token",
                        ...body,
                    }),
                }),
            );

        const both = await register({
            baseUrl: "https://api.example.com/v1",
            source: "export default { fetch: () => new Response('ok') };",
        });
        expect(both.status).toBe(400);

        const neither = await register({});
        expect(neither.status).toBe(400);
    },
);

fixtureTest(
    "deploys worker source on registration, redeploys on update, deletes worker on removal",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `bee-${crypto.randomUUID().slice(0, 8)}`;
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

        const cfRequests: Request[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            const url = new URL(request.url);
            if (url.hostname !== "api.cloudflare.com") {
                throw new Error(`Unexpected fetch: ${request.url}`);
            }
            expect(request.headers.get("authorization")).toBe(
                "Bearer cf-deploy-token",
            );
            cfRequests.push(request.clone() as Request);
            if (
                request.method === "GET" &&
                url.pathname.endsWith("/workers/subdomain")
            ) {
                return Response.json({
                    success: true,
                    result: { subdomain: "staging-sub" },
                });
            }
            return Response.json({ success: true, result: {} });
        });
        vi.stubGlobal("fetch", fetchMock);

        const deployEnv = {
            ...env,
            CF_WORKER_DEPLOY_ACCOUNT_ID: "cf-account",
            CF_WORKER_DEPLOY_API_TOKEN: "cf-deploy-token",
        };
        const enterApi = await createEnterCommunityApi();
        const cookie = await signedSessionCookie(sessionToken);
        const source =
            "export default { fetch: () => Response.json({ ok: true }) };";
        // No bearerToken sent — source deploys mint their own worker auth token.
        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: modelName,
                    source,
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.1,
                }),
            }),
            deployEnv,
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as {
            id: string;
            baseUrl: string;
            source: string;
        };
        // Script name is keyed on the endpoint id, not owner/name.
        const scriptName = `bee-${created.id}`;
        expect(created).toMatchObject({
            baseUrl: `https://${scriptName}.staging-sub.workers.dev/v1`,
            source,
        });

        const putRequest = cfRequests.find(
            (request) => request.method === "PUT",
        );
        if (!putRequest) throw new Error("No worker upload PUT captured");
        expect(new URL(putRequest.url).pathname).toBe(
            `/client/v4/accounts/cf-account/workers/scripts/${scriptName}`,
        );
        const form = await putRequest.formData();
        const metadata = JSON.parse(String(form.get("metadata")));
        expect(metadata).toMatchObject({ main_module: "index.mjs" });
        // The generated auth token is injected as a secret binding.
        const authBinding = metadata.bindings?.find(
            (b: { name?: string }) => b?.name === "BEE_AUTH_TOKEN",
        );
        expect(authBinding).toMatchObject({ type: "secret_text" });
        expect(typeof authBinding.text).toBe("string");
        expect(authBinding.text.length).toBeGreaterThan(0);
        await expect((form.get("index.mjs") as File).text()).resolves.toBe(
            source,
        );

        const subdomainEnable = cfRequests.find(
            (request) =>
                request.method === "POST" &&
                new URL(request.url).pathname.endsWith(
                    `/workers/scripts/${scriptName}/subdomain`,
                ),
        );
        if (!subdomainEnable) throw new Error("No subdomain enable captured");
        await expect(subdomainEnable.json()).resolves.toEqual({
            enabled: true,
        });

        cfRequests.length = 0;
        const updatedSource =
            "export default { fetch: () => Response.json({ ok: 2 }) };";
        const updateResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${created.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: cookie,
                    },
                    body: JSON.stringify({ source: updatedSource }),
                },
            ),
            deployEnv,
        );
        expect(updateResponse.status).toBe(200);
        await expect(updateResponse.json()).resolves.toMatchObject({
            baseUrl: `https://${scriptName}.staging-sub.workers.dev/v1`,
            source: updatedSource,
        });
        // Redeploys the same id-keyed script — no orphan from the name.
        expect(
            cfRequests.filter((request) => request.method === "PUT"),
        ).toHaveLength(1);

        cfRequests.length = 0;
        const deleteResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${created.id}`,
                {
                    method: "DELETE",
                    headers: { Cookie: cookie },
                },
            ),
            deployEnv,
        );
        expect(deleteResponse.status).toBe(200);
        // Delete retires the public worker, not just the D1 row.
        const deleteWorkerCall = cfRequests.find(
            (request) => request.method === "DELETE",
        );
        if (!deleteWorkerCall) throw new Error("No worker DELETE captured");
        expect(new URL(deleteWorkerCall.url).pathname).toBe(
            `/client/v4/accounts/cf-account/workers/scripts/${scriptName}`,
        );
    },
);

fixtureTest(
    "deploys the prompt-agent template with config bindings and a minted owner key",
    async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `bee-${crypto.randomUUID().slice(0, 8)}`;
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

        const cfRequests: Request[] = [];
        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);
            const url = new URL(request.url);
            if (url.hostname !== "api.cloudflare.com") {
                throw new Error(`Unexpected fetch: ${request.url}`);
            }
            cfRequests.push(request.clone() as Request);
            if (
                request.method === "GET" &&
                url.pathname.endsWith("/workers/subdomain")
            ) {
                return Response.json({
                    success: true,
                    result: { subdomain: "staging-sub" },
                });
            }
            return Response.json({ success: true, result: {} });
        });
        vi.stubGlobal("fetch", fetchMock);

        const deployEnv = {
            ...env,
            CF_WORKER_DEPLOY_ACCOUNT_ID: "cf-account",
            CF_WORKER_DEPLOY_API_TOKEN: "cf-deploy-token",
        };
        const enterApi = await createEnterCommunityApi();
        const cookie = await signedSessionCookie(sessionToken);
        const promptAgent = {
            systemPrompt: "You are a terse SQL tutor.",
            baseModel: "openai-fast",
            tools: ["web_search"],
            mcpServers: [{ name: "docs", url: "https://mcp.example.com/rpc" }],
        };
        // No source, no baseUrl, no bearerToken — a prompt agent manages its own.
        const createResponse = await fetchEnterApi(
            enterApi,
            new Request("http://localhost:3000/api/community-endpoints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie,
                },
                body: JSON.stringify({
                    name: modelName,
                    promptAgent,
                    completionTextPrice: 0.1,
                    toolPrices: { web_search: 0.002 },
                }),
            }),
            deployEnv,
        );
        expect(createResponse.status).toBe(200);
        const created = (await createResponse.json()) as {
            id: string;
            source: string | null;
            promptAgent: typeof promptAgent | null;
        };
        // Prompt agents never expose their raw source blob, and surface the
        // config as promptAgent.
        expect(created.source).toBeNull();
        expect(created.promptAgent).toMatchObject({
            systemPrompt: "You are a terse SQL tutor.",
            baseModel: "openai-fast",
            tools: ["web_search"],
        });

        const scriptName = `bee-${created.id}`;
        const putRequest = cfRequests.find(
            (request) => request.method === "PUT",
        );
        if (!putRequest) throw new Error("No worker upload PUT captured");
        const form = await putRequest.formData();
        const metadata = JSON.parse(String(form.get("metadata")));
        const bindingByName = Object.fromEntries(
            (metadata.bindings ?? []).map((b: { name: string }) => [b.name, b]),
        );
        // The template config is injected as secret_text bindings alongside the
        // auth token, and the minted owner key is present (never returned).
        for (const name of [
            "BEE_AUTH_TOKEN",
            "SYSTEM_PROMPT",
            "BASE_MODEL",
            "TOOLS_JSON",
            "MCP_JSON",
            "POLLINATIONS_KEY",
            "GEN_BASE_URL",
        ]) {
            expect(bindingByName[name]).toMatchObject({ type: "secret_text" });
        }
        expect(bindingByName.SYSTEM_PROMPT.text).toBe(
            "You are a terse SQL tutor.",
        );
        expect(bindingByName.BASE_MODEL.text).toBe("openai-fast");
        expect(JSON.parse(bindingByName.TOOLS_JSON.text)).toEqual([
            "web_search",
        ]);
        expect(JSON.parse(bindingByName.MCP_JSON.text)).toEqual([
            { name: "docs", url: "https://mcp.example.com/rpc" },
        ]);
        expect(bindingByName.POLLINATIONS_KEY.text).toMatch(/^sk_/);
        // The deployed module is the platform template, not user source.
        await expect((form.get("index.mjs") as File).text()).resolves.toContain(
            "MAX_TOOL_ROUNDS",
        );

        // Delete retires the worker (its source is non-null) like any deploy.
        cfRequests.length = 0;
        const deleteResponse = await fetchEnterApi(
            enterApi,
            new Request(
                `http://localhost:3000/api/community-endpoints/${created.id}`,
                {
                    method: "DELETE",
                    headers: { Cookie: cookie },
                },
            ),
            deployEnv,
        );
        expect(deleteResponse.status).toBe(200);
        const deleteWorkerCall = cfRequests.find(
            (request) => request.method === "DELETE",
        );
        if (!deleteWorkerCall) throw new Error("No worker DELETE captured");
        expect(new URL(deleteWorkerCall.url).pathname).toBe(
            `/client/v4/accounts/cf-account/workers/scripts/${scriptName}`,
        );
    },
);
