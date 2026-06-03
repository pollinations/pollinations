import { createExecutionContext, env, SELF } from "cloudflare:test";
import {
    type CommunityEndpointRuntime,
    canManageCommunityEndpoints,
    capCommunityUsage,
    communityChatCompletionsUrl,
    communityModelId,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointBearerToken,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import {
    communityEndpoint as communityEndpointTable,
    session as sessionTable,
} from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import {
    createTestUser,
    test as fixtureTest,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCommunityEndpointCompletion } from "./text/communityEndpoint.ts";

const db = drizzle(env.DB);
const testLog = { getChild: () => testLog };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function createEnterCommunityApi(): Promise<Hono> {
    const routePath =
        "../../enter.pollinations.ai/src/routes/community-endpoints.ts";
    const { communityEndpointsRoutes } = (await import(routePath)) as {
        communityEndpointsRoutes: Hono;
    };
    return new Hono()
        .use("*", async (c, next) => {
            c.set("log" as never, testLog);
            await next();
        })
        .route("/api/community-endpoints", communityEndpointsRoutes);
}

async function fetchEnterApi(app: Hono, request: Request): Promise<Response> {
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

describe("community endpoint helpers", () => {
    it("keeps the MVP tier gate disabled", () => {
        expect(canManageCommunityEndpoints(null)).toBe(true);
        expect(canManageCommunityEndpoints("microbe")).toBe(true);
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

        expect(modelId).toBe("community/voodoohop/provider/path/model-name");
        expect(parseCommunityModelId(modelId)).toEqual({
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

    it("caps reported usage to the request estimate", () => {
        expect(
            capCommunityUsage(
                { contextLength: null },
                {
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 3,
                },
                {
                    prompt_tokens: 100,
                    completion_tokens: 100,
                    total_tokens: 200,
                },
            ),
        ).toEqual({
            prompt_tokens: 9,
            completion_tokens: 3,
            total_tokens: 12,
        });
    });

    it("clarifies upstream auth failures after sending the saved token", async () => {
        const secret = "test-secret";
        const endpoint: CommunityEndpointRuntime = {
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "community/voodoohop/openai",
            name: "openai",
            description: null,
            baseUrl: "https://api.example.com/v1",
            upstreamModel: "gpt-4.1-mini",
            bearerTokenCiphertext: await encryptSecret(
                "sk_saved_token",
                secret,
            ),
            promptTextPrice: 0.1,
            completionTextPrice: 0.1,
            contextLength: null,
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_input, init) => {
                expect(new Headers(init?.headers).get("authorization")).toBe(
                    "Bearer sk_saved_token",
                );
                return Response.json(
                    {
                        error: {
                            message: "Authentication required",
                        },
                    },
                    { status: 401, statusText: "Unauthorized" },
                );
            }),
        );

        await expect(
            generateCommunityEndpointCompletion(
                endpoint,
                {
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                },
                secret,
            ),
        ).rejects.toThrow(
            "Community endpoint rejected the saved bearer token after we sent it: 401 Unauthorized: Authentication required",
        );
    });
});

fixtureTest(
    "routes chat completions through a registered community endpoint with its saved token",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `openai-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
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
            contextLength: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const fetchMock = vi.fn(async (input, init) => {
            const request = new Request(input, init);

            if (request.url === "https://api.example.com/v1/chat/completions") {
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_saved_token",
                );
                await expect(request.json()).resolves.toMatchObject({
                    model: "gpt-4.1-mini",
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                    stream: false,
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

            if (
                request.url.startsWith(
                    "https://api.europe-west2.gcp.tinybird.co/",
                ) ||
                request.url.startsWith("http://localhost:7181/")
            ) {
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
        await expect(response.json()).resolves.toMatchObject({
            model: modelId,
            choices: [
                {
                    message: { content: "ok" },
                },
            ],
            usage: {
                prompt_tokens: 2,
                completion_tokens: 3,
                total_tokens: 5,
            },
        });

        const upstreamCalls = fetchMock.mock.calls.filter(
            ([input, init]) =>
                new Request(input, init).url ===
                "https://api.example.com/v1/chat/completions",
        );
        expect(upstreamCalls).toHaveLength(1);
    },
);

fixtureTest(
    "streams chat completions through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `stream-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
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
            contextLength: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (
                    request.url ===
                    "https://api.example.com/v1/chat/completions"
                ) {
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer sk_saved_token",
                    );
                    await expect(request.json()).resolves.toMatchObject({
                        model: "gpt-4.1-mini",
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: true,
                        stream_options: { include_usage: true },
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

                if (
                    request.url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/",
                    ) ||
                    request.url.startsWith("http://localhost:7181/")
                ) {
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
        expect(body).toContain(`"model":"${modelId}"`);
        expect(body).not.toContain('"model":"gpt-4.1-mini"');
        expect(body).toContain('"completion_tokens":5');
        expect(body).not.toContain('"prompt_tokens":999');
    },
);

fixtureTest(
    "routes simple text requests through a registered community endpoint",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `simple-${crypto.randomUUID().slice(0, 8)}`;
        const modelId = communityModelId(ownerGithubUsername, modelName);
        const ownerUserId = await createTestUser({
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
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
            contextLength: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input, init) => {
                const request = new Request(input, init);

                if (
                    request.url ===
                    "https://api.example.com/v1/chat/completions"
                ) {
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer sk_saved_token",
                    );
                    await expect(request.json()).resolves.toMatchObject({
                        model: "gpt-4.1-mini",
                        messages: [{ role: "user", content: "hello" }],
                        max_tokens: 5,
                        stream: false,
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

                if (
                    request.url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/",
                    ) ||
                    request.url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await SELF.fetch(
            new Request(
                `https://gen.pollinations.ai/text/hello?model=${encodeURIComponent(
                    modelId,
                )}&max_tokens=5`,
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            ),
        );

        expect(response.status).toBe(200);
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
            githubUsername: ownerGithubUsername,
        });
        await db.insert(communityEndpointTable).values({
            id: `endpoint-${crypto.randomUUID()}`,
            ownerUserId,
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
            contextLength: 8192,
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
            category?: string;
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
                context_length?: number;
            }[];
        };

        for (const models of [textModels, allModels]) {
            const listed = models.find((model) => model.name === modelId);
            expect(listed).toMatchObject({
                name: modelId,
                category: "community",
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
                    context_length: 8192,
                    supported_endpoints: expect.arrayContaining([
                        "/v1/chat/completions",
                    ]),
                }),
            ]),
        );
    },
);

fixtureTest(
    "registers a Pollinations-compatible endpoint through Enter API and uses it through gen",
    async ({ apiKey }) => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const modelName = `pollinations-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await createTestUser({
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

            if (
                request.url ===
                "https://gen.pollinations.ai/v1/chat/completions"
            ) {
                expect(request.headers.get("authorization")).toBe(
                    "Bearer sk_pollinations_upstream",
                );
                await expect(request.json()).resolves.toMatchObject({
                    model: "openai",
                    messages: [{ role: "user", content: "hello" }],
                    max_tokens: 5,
                    stream: false,
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

            if (
                request.url.startsWith(
                    "https://api.europe-west2.gcp.tinybird.co/",
                ) ||
                request.url.startsWith("http://localhost:7181/")
            ) {
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
                    promptTextPrice: 0.1,
                    completionTextPrice: 0.1,
                }),
            }),
        );

        expect(registerResponse.status).toBe(200);
        const registered = (await registerResponse.json()) as {
            modelId: string;
            baseUrl: string;
            upstreamModel: string;
            tokenConfigured: boolean;
        };
        expect(registered).toMatchObject({
            modelId: communityModelId(ownerGithubUsername, modelName),
            baseUrl: "https://gen.pollinations.ai/v1",
            upstreamModel: "openai",
            tokenConfigured: true,
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
            model: registered.modelId,
            choices: [{ message: { content: "ok" } }],
        });
        expect(
            fetchMock.mock.calls.filter(
                ([input, init]) =>
                    new Request(input, init).url ===
                    "https://gen.pollinations.ai/v1/chat/completions",
            ),
        ).toHaveLength(1);
    },
);
