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
import worker from "../../src/index.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";

// The test env has no real service account key, so stub token minting.
// beforeEach: the config's mock restoration would undo a beforeAll spy
// after the first test.
beforeEach(() => {
    vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
        "test-access-token",
    );
});

afterEach(async () => {
    await teardownFetchMock();
});

type VertexState = {
    requests: Array<{ url: string; body: Record<string, unknown> }>;
    usageMetadata: Record<string, unknown> | undefined;
};

function createNanobananaMocks() {
    const vertexState: VertexState = {
        requests: [],
        usageMetadata: undefined,
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
            },
        },
    });
}

const test = baseTest.extend<{
    mocks: ReturnType<typeof createNanobananaMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createNanobananaMocks();
        await use(mocks);
    },
});

async function fetchWorker(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    return { response, wait: () => waitOnExecutionContext(ctx) };
}

test("nanobanana bills exact Vertex usage end-to-end", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 11,
        candidatesTokenCount: 1290,
        totalTokenCount: 1301,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=nanobanana&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect(response.headers.get("x-model-used")).toBe("nanobanana");
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("11");
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "1290",
    );
    await wait();

    expect(mocks.vertex.state.requests).toHaveLength(1);
    expect(mocks.vertex.state.requests[0].url).toContain(
        "models/gemini-2.5-flash-image:generateContent",
    );
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "nanobanana",
        tokenCountPromptText: 11,
        tokenCountCompletionImage: 1290,
        isBilledUsage: true,
    });
});

test("nanobanana rejects a response without usage metadata", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = undefined;

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=nanobanana&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toContain(
        "invalid billing usage metadata",
    );
    await wait();
});

test("nanobanana rejects usage that does not sum to its total", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vertex");
    mocks.vertex.state.usageMetadata = {
        promptTokenCount: 11,
        candidatesTokenCount: 1290,
        totalTokenCount: 9999,
        promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }],
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=nanobanana&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(502);
    await wait();
});
