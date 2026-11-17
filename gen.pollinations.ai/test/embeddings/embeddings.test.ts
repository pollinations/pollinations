import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    type MockAPI,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { applyGeminiTaskInstruction } from "../../src/embeddings/input.ts";
import { MAX_EMBEDDING_BATCH_SIZE } from "../../src/embeddings/limits.ts";
import worker from "../../src/index.ts";
import { resetGenerationModelRegistryCache } from "../../src/model-registry.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const TEST_EMBEDDING_MODEL = "google/gemini-embedding-2";
const TEST_PROVIDER_MODEL = "gemini-embedding-2";
const TEST_OPENAI_SMALL_MODEL = "openai/text-embedding-3-small";
const TEST_OPENAI_LARGE_MODEL = "openai/text-embedding-3-large";
const TEST_OPENAI_SMALL_PROVIDER_MODEL = "text-embedding-3-small";
const TEST_OPENAI_LARGE_PROVIDER_MODEL = "text-embedding-3-large";
const TEST_COHERE_MODEL = "cohere/embed-v4.0";
const TEST_COHERE_PROVIDER_MODEL = "embed-v-4-0";
const TEST_QWEN_MODEL = "qwen/qwen3-embedding-8b";
const TEST_QWEN_PROVIDER_MODEL = "Qwen/Qwen3-Embedding-8B";
const DEEPINFRA_HOST = "api.deepinfra.com";
const TEST_EMBEDDING_INPUT = "Hello world";
const VERTEX_HOST = "aiplatform.us.rep.googleapis.com";
const AZURE_HOST = "myceli-prod-eastus.cognitiveservices.azure.com";
const BEDROCK_HOST = "bedrock-runtime.us-east-1.amazonaws.com";
const FIREWORKS_HOST = "api.fireworks.ai";
const TINYBIRD_STATS_HOST = "api.europe-west2.gcp.tinybird.co";

beforeEach(() => {
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
        "test-google-access-token",
    );
});

afterEach(async () => {
    await teardownFetchMock();
    vi.restoreAllMocks();
});

const test = baseTest.extend<{
    mocks: ReturnType<typeof createEmbeddingMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createEmbeddingMocks();
        await use(mocks);
    },
});

function buildEmbeddingsBody(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
        model: TEST_EMBEDDING_MODEL,
        input: TEST_EMBEDDING_INPUT,
        ...extra,
    });
}

function createEmbeddingMocks() {
    env.GOOGLE_PROJECT_ID = "test-project";
    env.OPENAI_API_KEY = "test-openai-api-key";
    env.AZURE_MYCELI_PROD_API_KEY = "test-azure-api-key";
    env.AWS_ACCESS_KEY_ID = "test-aws-access-key";
    env.AWS_SECRET_ACCESS_KEY = "test-aws-secret-key";
    env.AWS_REGION = "us-east-1";
    env.DEEPINFRA_API_KEY = "test-deepinfra-api-key";
    env.FIREWORKS_NEO_API_KEY = "test-fireworks-neo-api-key";
    process.env.GOOGLE_PROJECT_ID = env.GOOGLE_PROJECT_ID;

    return createFetchMock({
        tinybird: createMockTinybird(),
        tinybirdStats: {
            state: {},
            handlerMap: {
                [TINYBIRD_STATS_HOST]: async () => Response.json({ data: [] }),
            },
            reset: () => {},
        } satisfies MockAPI<Record<string, never>>,
        azureOpenAI: createOpenAIMock(),
        openai: createOpenAIMock("api.openai.com"),
        cohereAzure: createCohereAzureMock(),
        fireworks: createHostedMock(FIREWORKS_HOST),
        deepinfra: createHostedMock(DEEPINFRA_HOST),
        vertex: createVertexMock(),
    });
}

function createVertexMock(): MockAPI<{ requests: unknown[]; urls: string[] }> {
    const state: { requests: unknown[]; urls: string[] } = {
        requests: [],
        urls: [],
    };
    return {
        state,
        handlerMap: {
            [VERTEX_HOST]: async (request) => {
                const body = (await request.json()) as {
                    content?: { parts?: Array<Record<string, unknown>> };
                    embedContentConfig?: { outputDimensionality?: number };
                };
                state.urls.push(request.url);
                state.requests.push(body);
                const dimensions =
                    body.embedContentConfig?.outputDimensionality ?? 3;
                const inlineData =
                    (
                        body.content?.parts?.[0]?.inlineData as
                            | { mimeType?: string }
                            | undefined
                    )?.mimeType ?? "";
                const modality = inlineData.startsWith("image/")
                    ? "IMAGE"
                    : inlineData.startsWith("audio/")
                      ? "AUDIO"
                      : inlineData.startsWith("video/")
                        ? "VIDEO"
                        : "TEXT";
                return Response.json({
                    embedding: {
                        values: Array.from(
                            { length: dimensions },
                            (_, index) => index / 10,
                        ),
                    },
                    usageMetadata: {
                        promptTokenCount: 5,
                        totalTokenCount: 5,
                        promptTokensDetails: [{ modality, tokenCount: 5 }],
                    },
                });
            },
        },
        reset: () => {
            state.requests = [];
            state.urls = [];
        },
    };
}

function createOpenAIMock(host = AZURE_HOST): MockAPI<{
    requests: unknown[];
    urls: string[];
    apiKeys: (string | null)[];
    bedrockRequests: unknown[];
    bedrockUsage?: string | null;
    authorization: (string | null)[];
    failModel?: string;
}> {
    const state: {
        requests: unknown[];
        urls: string[];
        apiKeys: (string | null)[];
        bedrockRequests: unknown[];
        bedrockUsage?: string | null;
        authorization: (string | null)[];
        failModel?: string;
    } = {
        requests: [],
        urls: [],
        apiKeys: [],
        bedrockRequests: [],
        authorization: [],
    };
    return {
        state,
        handlerMap: {
            [host]: async (request) => {
                const body = (await request.json()) as {
                    input?: string[];
                    dimensions?: number;
                    model?: string;
                };
                state.urls.push(request.url);
                state.requests.push(body);
                if (body.model === state.failModel) {
                    return Response.json(
                        { error: { message: "rate limited" } },
                        { status: 429 },
                    );
                }
                state.apiKeys.push(request.headers.get("api-key"));
                state.authorization.push(request.headers.get("authorization"));

                const inputs = body.input ?? [];
                const dimensions =
                    body.dimensions ??
                    (body.model === TEST_OPENAI_LARGE_PROVIDER_MODEL
                        ? 3072
                        : 1536);

                return Response.json({
                    object: "list",
                    data: inputs
                        .map((_, index) => ({
                            object: "embedding",
                            embedding: Array.from(
                                { length: dimensions },
                                (_, valueIndex) => index + valueIndex / 10,
                            ),
                            index,
                        }))
                        .reverse(),
                    model: body.model,
                    usage: {
                        prompt_tokens: inputs.length * 4,
                        total_tokens: inputs.length * 4,
                    },
                });
            },
        },
        reset: () => {
            state.requests = [];
            state.urls = [];
            state.failModel = undefined;
            state.apiKeys = [];
            state.authorization = [];
        },
    };
}

function createCohereAzureMock(): MockAPI<{
    requests: unknown[];
    urls: string[];
    failPrimary?: boolean | "network";
    apiKeys: (string | null)[];
    bedrockRequests: unknown[];
    bedrockUsage?: string | null;
}> {
    const state: {
        requests: unknown[];
        urls: string[];
        failPrimary?: boolean | "network";
        apiKeys: (string | null)[];
        bedrockRequests: unknown[];
        bedrockUsage?: string | null;
    } = {
        requests: [],
        urls: [],
        apiKeys: [],
        bedrockRequests: [],
    };
    const handler = async (request: Request) => {
        const body = (await request.json()) as {
            input?: (string | { image: string; text?: string })[];
            input_type?: string;
            dimensions?: number;
            model?: string;
        };
        state.urls.push(request.url);
        state.requests.push(body);
        state.apiKeys.push(request.headers.get("api-key"));
        if (state.failPrimary === "network")
            throw new Error("Network connection lost.");
        if (state.failPrimary && new URL(request.url).hostname === AZURE_HOST) {
            return Response.json(
                { error: { message: "Primary unavailable" } },
                { status: 503 },
            );
        }

        const inputs = body.input ?? [];
        const dimensions = body.dimensions ?? 1536;

        return Response.json({
            object: "list",
            data: inputs
                .map((_, index) => ({
                    object: "embedding",
                    embedding: Array.from(
                        { length: dimensions },
                        (_, valueIndex) => index + valueIndex / 10,
                    ),
                    index,
                }))
                .reverse(),
            model: body.model,
            usage: {
                prompt_tokens: inputs.length * 4,
                total_tokens: inputs.length * 4,
            },
        });
    };
    return {
        state,
        handlerMap: {
            [AZURE_HOST]: handler,
            [BEDROCK_HOST]: async (request) => {
                expect(request.url).toBe(
                    `https://${BEDROCK_HOST}/model/global.cohere.embed-v4:0/invoke`,
                );
                expect(request.headers.get("authorization")).toContain(
                    "AWS4-HMAC-SHA256",
                );
                expect(request.headers.has("api-key")).toBe(false);
                const body = (await request.json()) as {
                    texts?: string[];
                    images?: string[];
                    inputs?: unknown[];
                    output_dimension: number;
                };
                state.bedrockRequests.push(body);
                const count = (body.texts ?? body.images ?? body.inputs ?? [])
                    .length;
                const usage =
                    state.bedrockUsage === undefined
                        ? String(count * 4)
                        : state.bedrockUsage;
                return Response.json(
                    {
                        embeddings: {
                            float: Array.from({ length: count }, (_, index) =>
                                Array.from(
                                    { length: body.output_dimension },
                                    (_, coordinate) => index + coordinate / 10,
                                ),
                            ),
                        },
                    },
                    {
                        headers:
                            usage === null
                                ? {}
                                : { "x-amzn-bedrock-input-token-count": usage },
                    },
                );
            },
        },
        reset: () => {
            state.requests = [];
            state.urls = [];
            state.apiKeys = [];
            state.failPrimary = undefined;
            state.bedrockRequests = [];
            state.bedrockUsage = undefined;
        },
    };
}

function createHostedMock(host: string): MockAPI<{
    requests: unknown[];
    urls: string[];
}> {
    const state: { requests: unknown[]; urls: string[] } = {
        requests: [],
        urls: [],
    };
    return {
        state,
        handlerMap: {
            [host]: async (request) => {
                const body = (await request.json()) as {
                    input?: string[];
                    dimensions?: number;
                    model?: string;
                };
                state.urls.push(request.url);
                state.requests.push(body);

                const inputs = body.input ?? [];
                const dimensions = body.dimensions ?? 4096;

                return Response.json({
                    object: "list",
                    data: inputs
                        .map((_, index) => ({
                            object: "embedding",
                            embedding: Array.from(
                                { length: dimensions },
                                (_, valueIndex) => index + valueIndex / 10,
                            ),
                            index,
                        }))
                        .reverse(),
                    model: body.model,
                    usage: {
                        prompt_tokens: inputs.length * 4,
                        total_tokens: inputs.length * 4,
                    },
                });
            },
        },
        reset: () => {
            state.requests = [];
            state.urls = [];
        },
    };
}

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    return {
        response,
        wait: () => waitOnExecutionContext(ctx),
    };
}

describe("POST /v1/embeddings", () => {
    for (const [model, provider] of [
        [TEST_OPENAI_SMALL_MODEL, "azureOpenAI"],
        [TEST_COHERE_MODEL, "cohereAzure"],
        [TEST_QWEN_MODEL, "deepinfra"],
    ] as const) {
        test(`sorts out-of-order ${model} embeddings before base64 encoding`, async ({
            paidApiKey: apiKey,
            mocks,
        }) => {
            await mocks.enable("tinybird", "tinybirdStats", provider);
            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: buildEmbeddingsBody({
                    model,
                    input: ["Hello", "World"],
                    dimensions: 256,
                    encoding_format: "base64",
                }),
            });
            expect(response.status).toBe(200);
            const result = await response.json<{
                data: { object: string; embedding: string; index: number }[];
                model: string;
                usage: { prompt_tokens: number; total_tokens: number };
            }>();
            expect(result.data.map(({ index }) => index)).toEqual([0, 1]);
            for (const item of result.data) {
                expect(item.object).toBe("embedding");
                const bytes = Buffer.from(item.embedding, "base64");
                expect(bytes.length).toBe(256 * 4);
                expect(bytes.readFloatLE(0)).toBe(item.index);
                expect(bytes.readFloatLE(4)).toBeCloseTo(item.index + 0.1);
            }
            expect(result.model).toBe(model);
            expect(result.usage).toEqual({ prompt_tokens: 8, total_tokens: 8 });
            expect(response.headers.get("x-model-used")).toBe(model);
            expect(response.headers.get("x-usage-prompt-text-tokens")).toBe(
                "8",
            );
            await wait();
            expect(mocks.tinybird.state.events).toHaveLength(1);
            expect(mocks.tinybird.state.events[0]).toMatchObject({
                modelUsed: model,
                tokenCountPromptText: 8,
                isBilledUsage: true,
            });
        });
    }

    test("keeps the Azure large quote during exact-model OpenAI recovery", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable(
            "tinybird",
            "tinybirdStats",
            "azureOpenAI",
            "openai",
        );
        mocks.azureOpenAI.state.failModel = "text-embedding-3-large";
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: "openai/text-embedding-3-large",
                input: ["Hello", "World"],
                dimensions: 256,
                encoding_format: "base64",
            }),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(
            "openai/text-embedding-3-large:openai",
        );
        const data = await response.json<{
            model: string;
            data: { index: number; embedding: string }[];
            usage: { prompt_tokens: number };
        }>();
        // Embedding responses identify the served route, matching existing fallbacks.
        expect(data.model).toBe("openai/text-embedding-3-large:openai");
        expect(data.data.map((item) => item.index)).toEqual([0, 1]);
        for (const [index, item] of data.data.entries()) {
            const bytes = Uint8Array.from(atob(item.embedding), (char) =>
                char.charCodeAt(0),
            );
            expect(bytes.byteLength).toBe(256 * 4);
            expect(new DataView(bytes.buffer).getFloat32(0, true)).toBe(index);
        }
        expect(data.usage.prompt_tokens).toBe(8);
        expect(mocks.openai.state.urls).toEqual([
            "https://api.openai.com/v1/embeddings",
        ]);
        expect(mocks.openai.state.authorization).toEqual([
            "Bearer test-openai-api-key",
        ]);
        expect(mocks.openai.state.apiKeys).toEqual([null]);
        expect(mocks.openai.state.requests).toEqual([
            {
                model: "text-embedding-3-large",
                input: ["Hello", "World"],
                dimensions: 256,
            },
        ]);
        await wait();
        const billed = mocks.tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(billed).toHaveLength(1);
        expect(billed[0]).toMatchObject({
            modelRequested: "openai/text-embedding-3-large",
            modelUsed: "openai/text-embedding-3-large:openai",
            tokenCountPromptText: 8,
            totalCost: 1.04e-6,
            totalPrice: 7.8e-7,
        });
    });

    test("rejects Gemini task hints without text content", () => {
        expect(() => applyGeminiTaskInstruction([], "RETRIEVAL_QUERY")).toThrow(
            "task_type requires non-empty Gemini text input",
        );
    });

    test("returns an OpenAI-compatible response and tracks billing", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody(),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as {
            object: string;
            data: { object: string; embedding: number[]; index: number }[];
            model: string;
            usage: { prompt_tokens: number; total_tokens: number };
        };
        expect(data.object).toBe("list");
        expect(data.data).toEqual([
            {
                object: "embedding",
                embedding: [0, 0.1, 0.2],
                index: 0,
            },
        ]);
        expect(data.model).toBe(TEST_EMBEDDING_MODEL);
        expect(data.usage).toEqual({ prompt_tokens: 5, total_tokens: 5 });
        expect(response.headers.get("x-model-used")).toBe(TEST_EMBEDDING_MODEL);
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("5");
        expect(mocks.vertex.state.requests).toHaveLength(1);

        await wait();

        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelRequested: TEST_EMBEDDING_MODEL,
            resolvedModelRequested: TEST_EMBEDDING_MODEL,
            modelUsed: TEST_EMBEDDING_MODEL,
            tokenCountPromptText: 5,
            tokenCountCompletionText: 0,
            isBilledUsage: true,
        });
        expect(events[0].totalPrice).toBeGreaterThan(0);
    });

    test("keeps the Azure small quote during exact-model OpenAI recovery", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable(
            "tinybird",
            "tinybirdStats",
            "azureOpenAI",
            "openai",
        );
        mocks.azureOpenAI.state.failModel = "text-embedding-3-small";
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: "openai/text-embedding-3-small",
                input: ["Hello", "World"],
                dimensions: 256,
                encoding_format: "base64",
            }),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(
            "openai/text-embedding-3-small:openai",
        );
        const data = await response.json<{
            model: string;
            data: { index: number; embedding: string }[];
            usage: { prompt_tokens: number };
        }>();
        // Embedding responses identify the served route, matching existing fallbacks.
        expect(data.model).toBe("openai/text-embedding-3-small:openai");
        expect(data.data.map((item) => item.index)).toEqual([0, 1]);
        for (const [index, item] of data.data.entries()) {
            const bytes = Uint8Array.from(atob(item.embedding), (char) =>
                char.charCodeAt(0),
            );
            expect(bytes.byteLength).toBe(256 * 4);
            expect(new DataView(bytes.buffer).getFloat32(0, true)).toBe(index);
        }
        expect(data.usage.prompt_tokens).toBe(8);
        expect(mocks.openai.state.urls).toEqual([
            "https://api.openai.com/v1/embeddings",
        ]);
        expect(mocks.openai.state.authorization).toEqual([
            "Bearer test-openai-api-key",
        ]);
        expect(mocks.openai.state.apiKeys).toEqual([null]);
        expect(mocks.openai.state.requests).toEqual([
            {
                model: "text-embedding-3-small",
                input: ["Hello", "World"],
                dimensions: 256,
            },
        ]);
        await wait();
        const billed = mocks.tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(billed).toHaveLength(1);
        expect(billed[0]).toMatchObject({
            modelRequested: "openai/text-embedding-3-small",
            modelUsed: "openai/text-embedding-3-small:openai",
            tokenCountPromptText: 8,
            totalCost: 1.6e-7,
            totalPrice: 1.2e-7,
        });
    });

    test("uses the shared fallback loop for embeddings", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        const source = getRegistryModelDefinition(TEST_OPENAI_SMALL_MODEL);
        const previousFallbacks = source.fallbacks;
        try {
            source.fallbacks = [TEST_OPENAI_LARGE_MODEL];
            await resetGenerationModelRegistryCache(env);
            await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
            mocks.azureOpenAI.state.failModel =
                TEST_OPENAI_SMALL_PROVIDER_MODEL;

            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: buildEmbeddingsBody({ model: TEST_OPENAI_SMALL_MODEL }),
            });

            expect(response.status).toBe(200);
            expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
                "config.targets[1]",
            );
            expect(response.headers.get("x-model-used")).toBe(
                TEST_OPENAI_LARGE_MODEL,
            );
            await response.arrayBuffer();
            expect(mocks.azureOpenAI.state.requests).toMatchObject([
                { model: TEST_OPENAI_SMALL_PROVIDER_MODEL },
                { model: TEST_OPENAI_LARGE_PROVIDER_MODEL },
            ]);
            await wait();
        } finally {
            source.fallbacks = previousFallbacks;
            await resetGenerationModelRegistryCache(env);
        }
    });

    test("uses the provider model id and supports custom dimensions", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ dimensions: 768 }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as { data: { embedding: number[] }[] };
        expect(data.data[0].embedding).toHaveLength(768);
        expect(mocks.vertex.state.urls[0]).toBe(
            `https://${VERTEX_HOST}/v1/projects/test-project/locations/us/publishers/google/models/${TEST_PROVIDER_MODEL}:embedContent`,
        );
        await wait();
    });

    test("converts Gemini task types to the GA prompt instruction", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ task_type: "RETRIEVAL_QUERY" }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        expect(mocks.vertex.state.requests[0]).toEqual({
            content: {
                parts: [
                    {
                        text: "task: search result | query: Hello world",
                    },
                ],
            },
            embedContentConfig: {},
        });
        await wait();
    });

    test("returns base64-encoded Float32 when encoding_format=base64", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ encoding_format: "base64" }),
        });
        const body = await response.text();

        expect(response.status).toBe(200);
        const data = JSON.parse(body) as { data: { embedding: string }[] };
        const encoded = data.data[0].embedding;
        expect(typeof encoded).toBe("string");
        const decoded = new Float32Array(Buffer.from(encoded, "base64").buffer);
        expect(Array.from(decoded)).toEqual([
            0,
            Math.fround(0.1),
            Math.fround(0.2),
        ]);
        await wait();
    });

    test("supports batch input", async ({ paidApiKey: apiKey, mocks }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ input: ["Hello", "World"] }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as { data: { index: number }[] };
        expect(data.data).toHaveLength(2);
        expect(data.data.map(({ index }) => index)).toEqual([0, 1]);
        expect(mocks.vertex.state.requests).toHaveLength(2);
        await wait();
    });

    test("rejects string batches above the public input limit", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                input: Array.from(
                    { length: MAX_EMBEDDING_BATCH_SIZE + 1 },
                    (_, index) => `input ${index}`,
                ),
            }),
        });

        expect(response.status).toBe(400);
        expect(mocks.vertex.state.requests).toHaveLength(0);
        await wait();
    });

    test("supports Azure OpenAI text-embedding-3-small", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_SMALL_MODEL,
                input: ["Hello", "World"],
                dimensions: 512,
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as {
            data: { embedding: number[]; index: number }[];
            model: string;
            usage: { prompt_tokens: number; total_tokens: number };
        };
        expect(data.model).toBe(TEST_OPENAI_SMALL_MODEL);
        expect(data.data).toHaveLength(2);
        expect(data.data[0].embedding).toHaveLength(512);
        expect(data.data.map(({ index }) => index)).toEqual([0, 1]);
        expect(data.usage).toEqual({ prompt_tokens: 8, total_tokens: 8 });
        expect(response.headers.get("x-model-used")).toBe(
            TEST_OPENAI_SMALL_MODEL,
        );
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("8");
        expect(mocks.azureOpenAI.state.requests).toEqual([
            {
                model: TEST_OPENAI_SMALL_PROVIDER_MODEL,
                input: ["Hello", "World"],
                dimensions: 512,
            },
        ]);
        expect(mocks.azureOpenAI.state.apiKeys).toEqual(["test-azure-api-key"]);
        expect(mocks.azureOpenAI.state.authorization).toEqual([null]);

        await wait();

        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelRequested: TEST_OPENAI_SMALL_MODEL,
            resolvedModelRequested: TEST_OPENAI_SMALL_MODEL,
            modelUsed: TEST_OPENAI_SMALL_MODEL,
            tokenCountPromptText: 8,
            totalCost: 0.00000016,
            totalPrice: 0.00000012,
            isBilledUsage: true,
        });
    });

    test("supports Azure OpenAI text-embedding-3-large", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_LARGE_MODEL,
                input: TEST_EMBEDDING_INPUT,
                dimensions: 256,
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as {
            data: { embedding: number[]; index: number }[];
            model: string;
        };
        expect(data.model).toBe(TEST_OPENAI_LARGE_MODEL);
        expect(data.data).toHaveLength(1);
        expect(data.data[0].embedding).toHaveLength(256);
        expect(mocks.azureOpenAI.state.requests).toEqual([
            {
                model: TEST_OPENAI_LARGE_PROVIDER_MODEL,
                input: [TEST_EMBEDDING_INPUT],
                dimensions: 256,
            },
        ]);
        await wait();

        expect(mocks.tinybird.state.events).toHaveLength(1);
        expect(mocks.tinybird.state.events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelRequested: TEST_OPENAI_LARGE_MODEL,
            resolvedModelRequested: TEST_OPENAI_LARGE_MODEL,
            modelUsed: TEST_OPENAI_LARGE_MODEL,
            tokenCountPromptText: 4,
            totalCost: 0.00000052,
            totalPrice: 0.00000039,
            isBilledUsage: true,
        });
    });

    test("supports Cohere Embed v4 through Azure", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_COHERE_MODEL,
                input: ["Hello", "World"],
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as {
            data: { embedding: number[]; index: number }[];
            model: string;
            usage: { prompt_tokens: number; total_tokens: number };
        };
        expect(data.model).toBe(TEST_COHERE_MODEL);
        expect(data.data).toHaveLength(2);
        expect(data.data[0].embedding).toHaveLength(1536);
        expect(data.data.map(({ index }) => index)).toEqual([0, 1]);
        expect(data.usage).toEqual({ prompt_tokens: 8, total_tokens: 8 });
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("8");
        expect(mocks.cohereAzure.state.requests).toEqual([
            {
                model: TEST_COHERE_PROVIDER_MODEL,
                input: ["Hello", "World"],
                input_type: "document",
            },
        ]);
        await wait();

        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelRequested: TEST_COHERE_MODEL,
            resolvedModelRequested: TEST_COHERE_MODEL,
            modelUsed: TEST_COHERE_MODEL,
            tokenCountPromptText: 8,
            isBilledUsage: true,
        });
    });

    test.for([
        ["text", true],
        ["image", true],
        ["text", "network"],
        ["image", "network"],
    ] as const)(
        "rescues Cohere %s embeddings after %s failure through global AWS without changing the quote",
        async ([modality, failure], { apiKey, mocks }) => {
            await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
            mocks.cohereAzure.state.failPrimary = failure;
            const input =
                modality === "image"
                    ? [
                          {
                              type: "image_url",
                              image_url: {
                                  url: "data:image/png;base64,aGVsbG8=",
                              },
                          },
                      ]
                    : ["Hello", "World"];
            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: buildEmbeddingsBody({
                    model: TEST_COHERE_MODEL,
                    input,
                    dimensions: 256,
                    input_type: "query",
                }),
            });
            expect(response.status).toBe(200);
            expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
                "config.targets[1]",
            );
            const body = (await response.json()) as {
                model: string;
                data: { embedding: number[] }[];
            };
            expect(body.data[0].embedding).toHaveLength(256);
            expect(mocks.cohereAzure.state.urls).toHaveLength(1);
            expect(mocks.cohereAzure.state.apiKeys).toEqual([
                "test-azure-api-key",
            ]);
            expect(mocks.cohereAzure.state.bedrockRequests).toEqual([
                {
                    input_type:
                        modality === "image"
                            ? "search_document"
                            : "search_query",
                    embedding_types: ["float"],
                    output_dimension: 256,
                    ...(modality === "image"
                        ? { images: ["data:image/png;base64,aGVsbG8="] }
                        : { texts: ["Hello", "World"] }),
                },
            ]);
            await wait();
            const events = mocks.tinybird.state.events;
            const billed = events.filter((event) => event.isBilledUsage);
            expect(billed).toHaveLength(1);
            expect(billed[0]).toMatchObject({
                modelRequested: TEST_COHERE_MODEL,
                resolvedModelRequested: TEST_COHERE_MODEL,
                modelUsed: "cohere/embed-v4.0:aws",
                totalCost:
                    modality === "image"
                        ? (4 * 0.12) / 1_000_000
                        : (8 * 0.12) / 1_000_000,
                totalPrice: modality === "image" ? 0.00000141 : 0.00000072,
            });
        },
    );

    test.for([null, "", "bad", "-1", "1.5"])(
        "rejects invalid Bedrock embedding usage %s without charging",
        async (usage, { apiKey, mocks }) => {
            await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
            mocks.cohereAzure.state.failPrimary = true;
            mocks.cohereAzure.state.bedrockUsage = usage;
            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: buildEmbeddingsBody({ model: TEST_COHERE_MODEL }),
            });
            expect(response.status).toBe(502);
            await response.text();
            await wait();
            expect(
                mocks.tinybird.state.events.filter(
                    (event) => event.isBilledUsage,
                ),
            ).toHaveLength(0);
        },
    );

    test("passes Cohere query input_type through Azure", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_COHERE_MODEL,
                input_type: "query",
            }),
        });

        expect(response.status).toBe(200);
        await response.arrayBuffer();
        expect(mocks.cohereAzure.state.requests).toEqual([
            {
                model: TEST_COHERE_PROVIDER_MODEL,
                input: [TEST_EMBEDDING_INPUT],
                input_type: "query",
            },
        ]);
        await wait();
    });

    test("supports Cohere combined text and image embeddings through Azure", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_COHERE_MODEL,
                input: [
                    {
                        type: "text",
                        text: "Find visually similar items",
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
                dimensions: 256,
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("4");
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBeNull();
        expect(mocks.cohereAzure.state.urls[0]).toContain(
            "/models/images/embeddings?api-version=2024-05-01-preview",
        );
        expect(mocks.cohereAzure.state.requests).toEqual([
            {
                model: TEST_COHERE_PROVIDER_MODEL,
                input: [
                    {
                        image: "data:image/png;base64,aGVsbG8=",
                        text: "Find visually similar items",
                    },
                ],
                input_type: "document",
                dimensions: 256,
            },
        ]);
        await wait();

        expect(mocks.tinybird.state.events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelUsed: TEST_COHERE_MODEL,
            tokenCountPromptImage: 4,
            tokenCountPromptText: 0,
            isBilledUsage: true,
        });
    });

    test("supports DeepInfra Qwen3 embeddings at 4096 dimensions", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "deepinfra");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_QWEN_MODEL,
                input: TEST_EMBEDDING_INPUT,
                dimensions: 4096,
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as {
            data: { embedding: number[]; index: number }[];
            model: string;
            usage: { prompt_tokens: number; total_tokens: number };
        };
        expect(data.model).toBe(TEST_QWEN_MODEL);
        expect(data.data).toHaveLength(1);
        expect(data.data[0].embedding).toHaveLength(4096);
        expect(data.usage).toEqual({ prompt_tokens: 4, total_tokens: 4 });
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("4");
        expect(mocks.deepinfra.state.requests).toEqual([
            {
                model: TEST_QWEN_PROVIDER_MODEL,
                input: [TEST_EMBEDDING_INPUT],
                dimensions: 4096,
            },
        ]);
        await wait();

        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            eventType: "generate.embedding",
            modelRequested: TEST_QWEN_MODEL,
            resolvedModelRequested: TEST_QWEN_MODEL,
            modelUsed: TEST_QWEN_MODEL,
            tokenCountPromptText: 4,
            isBilledUsage: true,
        });
    });

    for (const mode of ["character limit", "rate limit"]) {
        test(`falls back to Fireworks for DeepInfra ${mode}`, async ({
            paidApiKey: apiKey,
            mocks,
        }) => {
            if (mode === "rate limit") {
                mocks.deepinfra.handlerMap[DEEPINFRA_HOST] = async () =>
                    Response.json(
                        { error: { message: "Capacity reached" } },
                        { status: 429 },
                    );
            }
            await mocks.enable(
                "tinybird",
                "tinybirdStats",
                "deepinfra",
                "fireworks",
            );
            const { response, wait } = await fetchWorker("/v1/embeddings", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                },
                body: buildEmbeddingsBody({
                    model: TEST_QWEN_MODEL,
                    ...(mode === "character limit"
                        ? { input: "x".repeat(131072) }
                        : {}),
                }),
            });
            expect(response.status).toBe(200);
            expect(response.headers.get("x-model-used")).toBe(
                `${TEST_QWEN_MODEL}:fireworks`,
            );
            await response.text();
            expect(mocks.deepinfra.state.requests).toHaveLength(0);
            expect(mocks.fireworks.state.requests).toHaveLength(1);
            await wait();
            const billed = mocks.tinybird.state.events.filter(
                (event) => event.isBilledUsage,
            );
            expect(billed).toHaveLength(1);
            expect(billed[0].modelProviderUsed).toBe("fireworks");
            expect(billed[0].totalCost).toBeCloseTo(0.0000004, 12);
            expect(billed[0].totalPrice).toBeCloseTo(0.00000004, 12);
        });
    }

    test("requires purchased pack balance for Qwen embeddings", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable(
            "tinybird",
            "tinybirdStats",
            "deepinfra",
            "fireworks",
        );
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ model: TEST_QWEN_MODEL }),
        });
        expect(response.status).toBe(402);
        await response.text();
        expect(mocks.deepinfra.state.requests).toHaveLength(0);
        expect(mocks.fireworks.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects text-embedding-3-small dimensions above its model limit", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_SMALL_MODEL,
                dimensions: 2048,
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("supports dimensions up to 1536");
        expect(mocks.azureOpenAI.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects Gemini dimensions above its model limit", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ dimensions: 3073 }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("supports dimensions up to 3072");
        expect(mocks.vertex.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects unsupported Cohere dimensions", async ({ apiKey, mocks }) => {
        await mocks.enable("tinybird", "tinybirdStats", "cohereAzure");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_COHERE_MODEL,
                dimensions: 768,
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("supports dimensions 256, 512, 1024, 1536");
        expect(mocks.cohereAzure.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects multimodal input for Azure OpenAI embeddings", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_SMALL_MODEL,
                input: [
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("text input only");
        expect(mocks.azureOpenAI.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects Gemini task hints for Azure OpenAI embeddings", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_SMALL_MODEL,
                task_type: "RETRIEVAL_QUERY",
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("task_type");
        expect(mocks.azureOpenAI.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects Cohere input_type for other providers", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "azureOpenAI");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                model: TEST_OPENAI_SMALL_MODEL,
                input_type: "query",
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("input_type");
        expect(mocks.azureOpenAI.state.requests).toHaveLength(0);
        await wait();
    });

    test("sends data URL images using Vertex REST media fields", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                input: [
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
            }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        expect(mocks.vertex.state.requests[0]).toMatchObject({
            content: {
                parts: [
                    {
                        inlineData: {
                            mimeType: "image/png",
                            data: "aGVsbG8=",
                        },
                    },
                ],
            },
        });
        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("5");
        await wait();
    });

    test("rejects Gemini task hints for multimodal input", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats", "vertex");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                input: [
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
                task_type: "RETRIEVAL_QUERY",
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("Gemini text input");
        expect(mocks.vertex.state.requests).toHaveLength(0);
        await wait();
    });

    test("rejects models that do not support embeddings", async ({
        apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats");
        const { response } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({ model: "flux" }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("image model");
        expect(body).toContain("embeddings endpoint");
    });

    test("rejects malformed media URLs", async ({
        paidApiKey: apiKey,
        mocks,
    }) => {
        await mocks.enable("tinybird", "tinybirdStats");
        const { response } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: buildEmbeddingsBody({
                input: [
                    {
                        type: "image_url",
                        image_url: { url: "not-a-url" },
                    },
                ],
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        // Refused by the URL guard before any fetch, and coded so a caller can
        // branch on it rather than on the prose.
        expect(body).toContain("Invalid media URL");
        expect(body).toContain("invalid_image_url");
    });

    test("rejects unauthenticated requests", async ({ mocks }) => {
        await mocks.enable("tinybird");
        const { response, wait } = await fetchWorker("/v1/embeddings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: buildEmbeddingsBody(),
        });

        expect(response.status).toBe(401);
        await wait();
    });
});

describe("embedding models", () => {
    test("returns detailed embedding models", async () => {
        const { response } = await fetchWorker("/embeddings/models");

        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            name: string;
            input_modalities?: string[];
            output_modalities?: string[];
            context_length?: number;
        }[];
        expect(data.map((model) => model.name)).not.toContain(
            "cohere/embed-v4.0:aws",
        );
        expect(data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: TEST_EMBEDDING_MODEL,
                    output_modalities: ["embedding"],
                }),
                expect.objectContaining({
                    name: TEST_OPENAI_SMALL_MODEL,
                    output_modalities: ["embedding"],
                }),
                expect.objectContaining({
                    name: TEST_OPENAI_LARGE_MODEL,
                    output_modalities: ["embedding"],
                }),
                expect.objectContaining({
                    name: TEST_COHERE_MODEL,
                    input_modalities: ["text", "image"],
                    output_modalities: ["embedding"],
                }),
                expect.objectContaining({
                    name: TEST_QWEN_MODEL,
                    context_length: 40960,
                    output_modalities: ["embedding"],
                }),
            ]),
        );
    });

    test("includes embeddings in the OpenAI-compatible model list", async () => {
        const { response } = await fetchWorker("/v1/models");

        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            object: string;
            data: { id: string; supported_endpoints?: string[] }[];
        };
        expect(data.object).toBe("list");
        expect(data.data.map((model) => model.id)).not.toContain(
            "cohere/embed-v4.0:aws",
        );
        expect(data.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: TEST_EMBEDDING_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
                expect.objectContaining({
                    id: TEST_OPENAI_SMALL_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
                expect.objectContaining({
                    id: TEST_OPENAI_LARGE_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
                expect.objectContaining({
                    id: TEST_COHERE_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
                expect.objectContaining({
                    id: TEST_QWEN_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
            ]),
        );
    });
});
