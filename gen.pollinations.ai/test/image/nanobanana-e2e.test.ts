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
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";

const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";

afterEach(async () => {
    await teardownFetchMock();
});

type OpenRouterState = {
    requests: Array<{ url: string; body: Record<string, unknown> }>;
    usage: Record<string, unknown> | undefined;
};

function createNanobananaMocks() {
    const openRouterState: OpenRouterState = {
        requests: [],
        usage: undefined,
    };
    return createFetchMock({
        tinybird: createMockTinybird(),
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

test("nanobanana bills exact OpenRouter usage end-to-end", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "openrouter");
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

    expect(mocks.openrouter.state.requests).toHaveLength(1);
    expect(mocks.openrouter.state.requests[0]).toMatchObject({
        url: "https://openrouter.ai/api/v1/images",
        body: {
            model: "google/gemini-2.5-flash-image",
            provider: {
                only: ["google-vertex/global"],
                allow_fallbacks: false,
            },
        },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        eventType: "generate.image",
        modelRequested: "nanobanana",
        tokenCountPromptText: 11,
        tokenCountCompletionImage: 1290,
        isBilledUsage: true,
    });
    const expectedCost = (11 * 0.3 + 1290 * 30) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBeCloseTo(expectedCost, 10);
});

test("nanobanana rejects a response without usage metadata", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "openrouter");
    mocks.openrouter.state.usage = undefined;

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=nanobanana&width=1024&height=1024&seed=42",
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
    await mocks.enable("tinybird", "openrouter");
    mocks.openrouter.state.usage = {
        prompt_tokens: 11,
        completion_tokens: 1290,
        total_tokens: 9999,
        completion_tokens_details: {
            reasoning_tokens: 0,
            image_tokens: 1290,
        },
    };

    const { response, wait } = await fetchWorker(
        "/image/red%20square?model=nanobanana&width=1024&height=1024&seed=42",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(502);
    await wait();
});

test("nanobanana-2 preserves 4K routing, reasoning, and exact billing", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "openrouter");
    mocks.openrouter.state.usage = {
        prompt_tokens: 12,
        completion_tokens: 2524,
        total_tokens: 2536,
        cost: 0.151254,
        prompt_tokens_details: {},
        completion_tokens_details: {
            reasoning_tokens: 4,
            image_tokens: 2520,
        },
    };

    const { response, wait } = await fetchWorker(
        "/image/black%20circle?model=nanobanana-2&width=3840&height=2160&seed=42&reasoning=pro",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("nanobanana-2");
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("12");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "4",
    );
    expect(response.headers.get("x-usage-completion-image-tokens")).toBe(
        "2520",
    );
    await response.arrayBuffer();
    await wait();

    expect(mocks.openrouter.state.requests).toHaveLength(1);
    expect(mocks.openrouter.state.requests[0]).toMatchObject({
        body: {
            model: "google/gemini-3.1-flash-image",
            resolution: "4K",
            reasoning_effort: "high",
            provider: {
                only: ["google-vertex/global"],
                allow_fallbacks: false,
            },
        },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        modelRequested: "nanobanana-2",
        tokenCountPromptText: 12,
        tokenCountCompletionReasoning: 4,
        tokenCountCompletionImage: 2520,
    });
    const expectedCost = (12 * 0.5 + 4 * 3 + 2520 * 60) / 1_000_000;
    expect(event.totalCost).toBeCloseTo(expectedCost, 10);
    expect(event.totalPrice).toBeCloseTo(expectedCost, 10);
});
