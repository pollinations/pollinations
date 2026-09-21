import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import worker from "../../src/index.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";

afterEach(async () => {
    await teardownFetchMock();
});

beforeEach(() => {
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
        "test-access-token",
    );
});

type VertexState = {
    requests: Array<{ url: string; body: Record<string, unknown> }>;
    usageMetadata: Record<string, unknown> | undefined;
    status: number;
};

type OpenRouterState = {
    requests: Array<{ url: string; body: Record<string, unknown> }>;
    usage: Record<string, unknown> | undefined;
};

function createNanobananaMocks() {
    const vertexState: VertexState = {
        requests: [],
        usageMetadata: undefined,
        status: 200,
    };
    const openRouterState: OpenRouterState = {
        requests: [],
        usage: undefined,
    };
    return createFetchMock({
        tinybird: createMockTinybird(),
        vertex: {
            state: vertexState,
            handlerMap: {
                "aiplatform.googleapis.com": async (request: Request) => {
                    vertexState.requests.push({
                        url: request.url,
                        body: (await request.json()) as Record<string, unknown>,
                    });
                    if (vertexState.status !== 200) {
                        return Response.json(
                            { error: { message: "Vertex unavailable" } },
                            { status: vertexState.status },
                        );
                    }
                    return Response.json({
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            inlineData: {
                                                mimeType: "image/png",
                                                data: png1x1Base64,
                                            },
                                        },
                                    ],
                                },
                                finishReason: "STOP",
                            },
                        ],
                        usageMetadata: vertexState.usageMetadata,
                    });
                },
            },
            reset: () => {
                vertexState.requests = [];
                vertexState.usageMetadata = undefined;
                vertexState.status = 200;
            },
        },
        openrouter: {
            state: openRouterState,
            handlerMap: {
                "openrouter.ai": async (request: Request) => {
                    openRouterState.requests.push({
                        url: request.url,
                        body: (await request.json()) as Record<string, unknown>,
                    });
                    return Response.json({
                        data: [
                            {
                                b64_json: png1x1Base64,
                                media_type: "image/png",
                            },
                        ],
                        usage: openRouterState.usage,
                    });
                },
            },
            reset: () => {
                openRouterState.requests = [];
                openRouterState.usage = undefined;
            },
        },
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createNanobananaMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        syncImageEnv(
            {
                GOOGLE_PROJECT_ID: "test-project",
                OPENROUTER_API_KEY: "openrouter-test-key",
            } as CloudflareBindings,
            ["GOOGLE_PROJECT_ID", "OPENROUTER_API_KEY"],
        );
        const mocks = createNanobananaMocks();
        await use(mocks);
    },
});

async function fetchWorker(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    return { response, wait: () => waitOnExecutionContext(ctx) };
}

test("nanobanana bills exact Vertex usage end-to-end", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex", "openrouter");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 11,
        candidatesTokenCount: 1290,
        totalTokenCount: 1301,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=google/gemini-2.5-flash-image&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(response.headers.get("x-model-used")).toBe(
        "google/gemini-2.5-flash-image",
    );
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("11");
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "1290",
    );
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.vertex.state.requests[0]).toMatchObject({
        body: {
            contents: [
                {
                    role: "user",
                    parts: [{ text: "red square" }],
                },
            ],
            generationConfig: {
                imageConfig: { aspectRatio: "1:1" },
                maxOutputTokens: 2048,
                responseModalities: ["TEXT", "IMAGE"],
                seed: 42,
                temperature: 0.7,
                topP: 0.9,
            },
            safetySettings: expect.arrayContaining([
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_ONLY_HIGH",
                },
            ]),
        },
    });
    expect(mocks.vertex.state.requests[0].url).toContain(
        "models/gemini-2.5-flash-image:generateContent",
    );
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        eventType: "generate.image",
        modelRequested: "google/gemini-2.5-flash-image",
        tokenCountPromptText: 11,
        tokenCountCompletionImage: 1290,
        isBilledUsage: true,
    });
    const expectedCost = (11 * 0.3 + 1290 * 30) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBe(Number((expectedCost * 1.055).toFixed(8)));
});

test("nanobanana falls back to its proven OpenRouter Vertex route", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex", "openrouter");
    mocks.vertex.state.status = 503;
    mocks.openrouter.state.usage = {
        prompt_tokens: 11,
        completion_tokens: 1290,
        total_tokens: 1301,
        cost: 0.0387033,
        prompt_tokens_details: {},
        completion_tokens_details: {
            reasoning_tokens: 0,
            image_tokens: 1290,
        },
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=google/gemini-2.5-flash-image&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(200);
    await response.arrayBuffer();
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.openrouter.state.requests).toHaveLength(1);
    expect(mocks.openrouter.state.requests[0]).toMatchObject({
        body: {
            model: "google/gemini-2.5-flash-image",
            provider: {
                only: ["google-vertex/global"],
                allow_fallbacks: false,
            },
        },
    });
    expect(response.headers.get("x-model-used")).toBe(
        "google/gemini-2.5-flash-image:openrouter:vertex-global",
    );
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "google/gemini-2.5-flash-image",
        responseStatus: 503,
        isFinal: false,
    });
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        modelUsed: "google/gemini-2.5-flash-image:openrouter:vertex-global",
        fallbackUsed: true,
        isFinal: true,
        responseStatus: 200,
    });
});

test("nanobanana rejects a response without usage metadata", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex", "openrouter");
    mocks.vertex.state.usageMetadata = undefined;

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=google/gemini-2.5-flash-image&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toContain(
        "invalid image billing usage",
    );
    await wait();
});

test("nanobanana rejects usage that does not sum to its total", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex", "openrouter");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 11,
        candidatesTokenCount: 1290,
        totalTokenCount: 9999,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=google/gemini-2.5-flash-image&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(502);
    await wait();
});

test("nanobanana-2 preserves 4K routing, reasoning, and exact billing", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 12,
        candidatesTokenCount: 2520,
        thoughtsTokenCount: 4,
        totalTokenCount: 2536,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 12 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 2520 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/black%20circle?model=google/gemini-3.1-flash-image&width=3840&height=2160&seed=42&reasoning=pro",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("x-model-used")).toBe(
        "google/gemini-3.1-flash-image",
    );
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("12");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "4",
    );
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "2520",
    );
    await response.arrayBuffer();
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.vertex.state.requests[0]).toMatchObject({
        body: {
            generationConfig: {
                imageConfig: { aspectRatio: "16:9", imageSize: "4K" },
                thinkingConfig: { thinkingLevel: "HIGH" },
            },
            safetySettings: expect.arrayContaining([
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_ONLY_HIGH",
                },
            ]),
        },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        modelRequested: "google/gemini-3.1-flash-image",
        tokenCountPromptText: 12,
        tokenCountCompletionReasoning: 4,
        tokenCountCompletionImage: 2520,
    });
    const expectedCost = (12 * 0.5 + 4 * 3 + 2520 * 60) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBe(Number((expectedCost * 1.055).toFixed(8)));
});

test("nanobanana-2-lite preserves fixed 1K routing and exact billing", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 10,
        candidatesTokenCount: 1120,
        thoughtsTokenCount: 4,
        totalTokenCount: 1134,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/white%20triangle?model=nanobanana-lite&width=1920&height=1080&seed=42&reasoning=pro",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("x-model-used")).toBe(
        "google/gemini-3.1-flash-lite-image",
    );
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("10");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "4",
    );
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "1120",
    );
    await response.arrayBuffer();
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.vertex.state.requests[0]).toMatchObject({
        body: {
            generationConfig: {
                imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
                thinkingConfig: { thinkingLevel: "HIGH" },
            },
        },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        modelRequested: "nanobanana-lite",
        tokenCountPromptText: 10,
        tokenCountCompletionReasoning: 4,
        tokenCountCompletionImage: 1120,
    });
    const expectedCost = (10 * 0.25 + 4 * 1.5 + 1120 * 30) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBe(Number((expectedCost * 1.055).toFixed(8)));
});

test("nanobanana-pro preserves 4K Vertex routing and exact billing", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 14,
        candidatesTokenCount: 2000,
        thoughtsTokenCount: 8,
        totalTokenCount: 2022,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 14 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 2000 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/purple%20hexagon?model=google/gemini-3-pro-image&width=3840&height=2160&seed=42&reasoning=pro",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("x-model-used")).toBe(
        "google/gemini-3-pro-image",
    );
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("14");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "8",
    );
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "2000",
    );
    await response.arrayBuffer();
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.vertex.state.requests[0]).toMatchObject({
        body: {
            generationConfig: {
                imageConfig: { aspectRatio: "16:9", imageSize: "4K" },
            },
        },
    });
    expect(
        (
            mocks.vertex.state.requests[0].body.generationConfig as Record<
                string,
                unknown
            >
        ).thinkingConfig,
    ).toBeUndefined();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        modelRequested: "google/gemini-3-pro-image",
        tokenCountPromptText: 14,
        tokenCountCompletionReasoning: 8,
        tokenCountCompletionImage: 2000,
    });
    const expectedCost = (14 * 2 + 8 * 12 + 2000 * 120) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBe(Number((expectedCost * 1.055).toFixed(8)));
});
