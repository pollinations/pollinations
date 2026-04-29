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
import { createMockVcr } from "@shared/test/mocks/vcr.ts";
import { afterEach, expect, inject } from "vitest";
import worker from "./index.ts";

const snapshotServerUrl = inject("snapshotServerUrl");
const png1x1 = Uint8Array.from(
    Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
        "base64",
    ),
);

afterEach(async () => {
    await teardownFetchMock();
});

const test = baseTest.extend<{
    mocks: ReturnType<typeof createGenerationMocks>;
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createGenerationMocks();
        await use(mocks);
    },
});

function createGenerationMocks() {
    return createFetchMock({
        tinybird: createMockTinybird(),
        vcr: createMockVcr({
            originalFetch: fakeUpstreamFetch,
            hosts: [
                { name: "text", host: new URL(env.TEXT_SERVICE_URL).host },
                { name: "image", host: new URL(env.IMAGE_SERVICE_URL).host },
            ],
            snapshotServerUrl,
            mode: env.TEST_VCR_MODE,
        }),
    });
}

async function fakeUpstreamFetch(input: RequestInfo | URL) {
    const request = new Request(input);
    const url = new URL(request.url);

    if (url.host === new URL(env.TEXT_SERVICE_URL).host) {
        return fakeTextServiceResponse(request, url);
    }

    if (url.host === new URL(env.IMAGE_SERVICE_URL).host) {
        return new Response(png1x1, {
            headers: usageHeaders({
                "content-type": "image/png",
                "x-model-used": url.searchParams.get("model") || "flux",
                "x-usage-completion-image-tokens": "1",
            }),
        });
    }

    throw new Error(`Unexpected upstream request: ${request.url}`);
}

async function fakeTextServiceResponse(request: Request, url: URL) {
    if (url.pathname.endsWith("/openai")) {
        const body = (await request.json()) as {
            model?: string;
            stream?: boolean;
        };
        const model = body.model || "openai-fast";

        if (body.stream) {
            const streamEvent = {
                id: "chatcmpl_vcr_stream",
                object: "chat.completion.chunk",
                model,
                choices: [
                    {
                        index: 0,
                        delta: { content: "snapshot stream" },
                        finish_reason: null,
                    },
                ],
            };
            const usageEvent = {
                ...streamEvent,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 7,
                    completion_tokens: 3,
                    total_tokens: 10,
                },
            };
            return new Response(
                `data: ${JSON.stringify(streamEvent)}\n\ndata: ${JSON.stringify(usageEvent)}\n\ndata: [DONE]\n\n`,
                {
                    headers: {
                        "content-type": "text/event-stream; charset=utf-8",
                    },
                },
            );
        }

        return Response.json(
            {
                id: "chatcmpl_vcr",
                object: "chat.completion",
                created: 1,
                model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "snapshot response",
                        },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 7,
                    completion_tokens: 3,
                    total_tokens: 10,
                },
            },
            {
                headers: usageHeaders({
                    "x-model-used": model,
                    "x-usage-prompt-text-tokens": "7",
                    "x-usage-completion-text-tokens": "3",
                }),
            },
        );
    }

    return new Response("snapshot text response", {
        headers: usageHeaders({
            "content-type": "text/plain; charset=utf-8",
            "x-model-used": url.searchParams.get("model") || "openai-fast",
            "x-usage-prompt-text-tokens": "6",
            "x-usage-completion-text-tokens": "4",
        }),
    });
}

function usageHeaders(headers: Record<string, string>) {
    return {
        "content-type": "application/json; charset=utf-8",
        ...headers,
    };
}

async function fetchWorker(path: string, init: RequestInit) {
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

test("chat completions use the VCR-backed text service", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vcr");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "vcr chat json" }],
        }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        choices: [
            {
                message: {
                    content: "snapshot response",
                },
            },
        ],
    });
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        responseStatus: 200,
        modelRequested: "openai-fast",
        tokenCountPromptText: 7,
        tokenCountCompletionText: 3,
        isBilledUsage: true,
    });
});

test("streaming chat completions replay through VCR", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vcr");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            stream: true,
            messages: [{ role: "user", content: "vcr chat stream" }],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toContain("snapshot stream");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        tokenCountPromptText: 7,
        tokenCountCompletionText: 3,
        isBilledUsage: true,
    });
});

test("simple text generation uses the VCR-backed text service", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vcr");

    const { response, wait } = await fetchWorker(
        "/text/vcr%20simple%20text?model=openai-fast&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("snapshot text response");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        requestPath: "/text/:prompt",
        tokenCountPromptText: 6,
        tokenCountCompletionText: 4,
        isBilledUsage: true,
    });
});

test("image generation uses the VCR-backed image service", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "vcr");

    const { response, wait } = await fetchWorker(
        "/image/vcr%20red%20square?model=flux&width=256&height=256&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "flux",
        tokenCountCompletionImage: 1,
        isBilledUsage: true,
    });
});
