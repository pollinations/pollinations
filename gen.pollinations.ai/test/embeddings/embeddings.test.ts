import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    type MockAPI,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import worker from "../../src/index.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

const TEST_EMBEDDING_MODEL = "gemini-embedding-2";
const TEST_PROVIDER_MODEL = "gemini-embedding-2-preview";
const TEST_EMBEDDING_INPUT = "Hello world";
const VERTEX_HOST = "us-central1-aiplatform.googleapis.com";
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
                        body.content?.parts?.[0]?.inline_data as
                            | { mime_type?: string }
                            | undefined
                    )?.mime_type ?? "";
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

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    return {
        response,
        wait: () => waitOnExecutionContext(ctx),
    };
}

describe("POST /v1/embeddings", () => {
    test("returns an OpenAI-compatible response and tracks billing", async ({
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

    test("uses the provider model id and supports custom dimensions", async ({
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
            body: buildEmbeddingsBody({ dimensions: 768 }),
        });
        const body = await response.text();

        expect(
            response.status,
            `Expected 200 but got ${response.status}: ${body}`,
        ).toBe(200);
        const data = JSON.parse(body) as { data: { embedding: number[] }[] };
        expect(data.data[0].embedding).toHaveLength(768);
        expect(mocks.vertex.state.urls[0]).toContain(TEST_PROVIDER_MODEL);
        await wait();
    });

    test("returns base64-encoded Float32 when encoding_format=base64", async ({
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

    test("supports batch input", async ({ apiKey, mocks }) => {
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

    test("blocks private media URLs", async ({ apiKey, mocks }) => {
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
                        image_url: { url: "http://127.0.0.1/test.png" },
                    },
                ],
            }),
        });
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain("Blocked request to private/internal URL");
        expect(body).toContain("127.0.0.1");
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
            output_modalities?: string[];
        }[];
        expect(data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: TEST_EMBEDDING_MODEL,
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
        expect(data.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: TEST_EMBEDDING_MODEL,
                    supported_endpoints: ["/v1/embeddings"],
                }),
            ]),
        );
    });
});
