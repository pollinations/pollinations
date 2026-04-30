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
import worker from "../src/index.ts";

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
    env.PORTKEY_GATEWAY_URL = "https://portkey.test";
    const portkeyHost = new URL(env.PORTKEY_GATEWAY_URL).host;
    return createFetchMock({
        tinybird: createMockTinybird(),
        portkeyDirect: {
            state: {},
            handlerMap: {
                [portkeyHost]: fakePortkeyResponse,
            },
            reset: () => {},
        },
        vcr: createMockVcr({
            originalFetch: fakeUpstreamFetch,
            hosts: [
                { name: "portkey", host: portkeyHost },
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

    if (url.host === new URL(env.PORTKEY_GATEWAY_URL).host) {
        return fakePortkeyResponse(request);
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

async function fakePortkeyResponse(request: Request) {
    const body = (await request.json()) as {
        messages?: Array<{ content?: unknown }>;
        model?: string;
        stream?: boolean;
    };
    const model = body.model || "openai-fast";
    const prompt =
        body.messages?.map((m) => contentToText(m.content)).join("\n") || "";

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

    const audioData = Buffer.from("snapshot audio bytes").toString("base64");
    const cases = [
        {
            matches: prompt.includes("vcr simple text"),
            content: "snapshot text response",
            promptTokens: 6,
            completionTokens: 4,
        },
        {
            matches: prompt.includes("vcr post text"),
            content: "snapshot post text response",
            promptTokens: 8,
            completionTokens: 5,
        },
        {
            matches: prompt.includes("vcr slash/inside"),
            content: "snapshot slash response",
            promptTokens: 9,
            completionTokens: 4,
        },
        {
            matches: prompt.includes("vcr citations text"),
            content: "snapshot cited response",
            promptTokens: 9,
            completionTokens: 2,
            citations: ["https://example.test/source"],
        },
    ];
    const selectedCase = cases.find((candidate) => candidate.matches);
    const isAudio =
        model === "openai-audio" || prompt.includes("vcr audio text");

    if (isAudio) {
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
                            audio: { data: audioData },
                        },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 11,
                    completion_tokens: 4,
                    total_tokens: 15,
                    completion_tokens_details: {
                        audio_tokens: 4,
                    },
                },
            },
            { headers: usageHeaders({}) },
        );
    }

    return Response.json(
        {
            id: "chatcmpl_vcr",
            object: "chat.completion",
            created: 1,
            model,
            citations: selectedCase?.citations,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: selectedCase?.content || "snapshot response",
                    },
                    finish_reason: "stop",
                },
            ],
            usage: {
                prompt_tokens: selectedCase?.promptTokens || 7,
                completion_tokens: selectedCase?.completionTokens || 3,
                total_tokens:
                    (selectedCase?.promptTokens || 7) +
                    (selectedCase?.completionTokens || 3),
            },
        },
        { headers: usageHeaders({}) },
    );
}

function contentToText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return String(content || "");
    return content
        .map((part) => {
            if (
                typeof part === "object" &&
                part &&
                "text" in part &&
                typeof part.text === "string"
            ) {
                return part.text;
            }
            return "";
        })
        .join("\n");
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

test("chat completions use local text generation with VCR-backed Portkey", async ({
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

test("simple text generation uses local text generation with VCR-backed Portkey", async ({
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
        requestPath: expect.stringContaining("/text/:prompt"),
        tokenCountPromptText: 6,
        tokenCountCompletionText: 4,
        isBilledUsage: true,
    });
});

test("POST /text returns assistant content directly", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/text", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "vcr post text" }],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("snapshot post text response");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        requestPath: "/text",
        tokenCountPromptText: 8,
        tokenCountCompletionText: 5,
        isBilledUsage: true,
    });
});

test("POST /text streams direct content responses", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/text", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            stream: true,
            messages: [{ role: "user", content: "vcr post stream" }],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("snapshot stream");
    expect(body).toContain("data: [DONE]");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        requestPath: "/text",
        tokenCountPromptText: 7,
        tokenCountCompletionText: 3,
        isBilledUsage: true,
    });
});

test("simple text keeps citations in direct content responses", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response } = await fetchWorker(
        "/text/vcr%20citations%20text?model=openai-fast&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(
        "snapshot cited response\n\n---\nSources:\n[1] https://example.test/source\n",
    );
});

test("simple text supports audio output models", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker(
        "/text/vcr%20audio%20text?model=openai-audio&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("audio/mpeg");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "openai-audio",
        tokenCountCompletionAudio: 4,
        isBilledUsage: true,
    });
});

test("simple text prompts can include slashes", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response } = await fetchWorker(
        "/text/vcr%20slash/inside?model=openai-fast&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("snapshot slash response");
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
