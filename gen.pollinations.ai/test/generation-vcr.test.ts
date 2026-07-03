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
const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";
const imageBackendHost = "image-backend.test";
const fireworksHost = "api.fireworks.ai";

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
    const fireworksState: {
        requests: Array<{
            body: Record<string, unknown>;
            headers: Record<string, string>;
            url: string;
        }>;
    } = { requests: [] };
    return createFetchMock({
        tinybird: createMockTinybird(),
        portkeyDirect: {
            state: {},
            handlerMap: {
                [portkeyHost]: fakePortkeyResponse,
            },
            reset: () => {},
        },
        imageBackend: {
            state: {},
            handlerMap: {
                [imageBackendHost]: fakeImageBackendResponse,
            },
            reset: () => {},
        },
        fireworks: {
            state: fireworksState,
            handlerMap: {
                [fireworksHost]: (request) =>
                    fakeFireworksFluxResponse(request, fireworksState),
            },
            reset: () => {
                fireworksState.requests = [];
            },
        },
        vcr: createMockVcr({
            originalFetch: fakeUpstreamFetch,
            hosts: [{ name: "portkey", host: portkeyHost }],
            snapshotServerUrl,
            mode: env.TEST_VCR_MODE,
        }),
    });
}

async function fakeFireworksFluxResponse(
    request: Request,
    state: {
        requests: Array<{
            body: Record<string, unknown>;
            headers: Record<string, string>;
            url: string;
        }>;
    },
) {
    const body = (await request.json()) as Record<string, unknown>;
    state.requests.push({
        body,
        headers: Object.fromEntries(request.headers.entries()),
        url: request.url,
    });

    return new Response(Buffer.from(png1x1Base64, "base64"), {
        headers: {
            "content-type": "image/jpeg",
            "finish-reason": "SUCCESS",
            seed: String(body.seed ?? 0),
        },
    });
}

async function fakeUpstreamFetch(input: RequestInfo | URL) {
    const request = new Request(input);
    const url = new URL(request.url);

    if (url.host === new URL(env.PORTKEY_GATEWAY_URL).host) {
        return fakePortkeyResponse(request);
    }

    throw new Error(`Unexpected upstream request: ${request.url}`);
}

async function fakeImageBackendResponse(request: Request) {
    const body = (await request.json()) as {
        height?: number;
        prompts?: string[];
    };
    const prompt = body.prompts?.[0] || "";
    if (prompt.includes("detail string")) {
        return Response.json({ detail: "prompt is too long" }, { status: 422 });
    }
    if (prompt.includes("plain upstream 400")) {
        return Response.json(
            { message: "missing provider key" },
            { status: 400 },
        );
    }
    if (prompt.includes("empty body 400")) {
        return new Response("", { status: 400 });
    }

    if (body.height && body.height < 256) {
        return Response.json(
            {
                detail: [
                    {
                        type: "greater_than_equal",
                        loc: ["body", "height"],
                        msg: "Input should be greater than or equal to 256",
                        input: body.height,
                        ctx: { ge: 256 },
                    },
                ],
            },
            { status: 422 },
        );
    }

    return Response.json([
        {
            image: png1x1Base64,
            isMature: false,
            isChild: false,
        },
    ]);
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
        const streamUsageExtras = prompt.includes("vcr perplexity stream cost")
            ? {
                  search_context_size: "low",
                  cost: {
                      request_cost: 0.007,
                      total_cost: 0.00701,
                  },
              }
            : {};
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
                ...streamUsageExtras,
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
            matches: prompt.includes("vcr empty text"),
            content: "",
            promptTokens: 5,
            completionTokens: 0,
            finishReason: "content_filter",
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
        {
            matches: prompt.includes("vcr perplexity reported cost"),
            content: "snapshot perplexity response",
            promptTokens: 10,
            completionTokens: 5,
            usageExtras: {
                search_context_size: "low",
                cost: {
                    request_cost: 0.006,
                    total_cost: 0.00602,
                },
            },
        },
        {
            matches: prompt.includes("vcr perplexity invalid cost"),
            content: "snapshot perplexity response",
            promptTokens: 10,
            completionTokens: 5,
            usageExtras: {
                search_context_size: "low",
                cost: {
                    request_cost: "not-a-number",
                },
            },
        },
        {
            matches: prompt.includes("vcr moderated text"),
            content: "snapshot moderated response",
            promptTokens: 6,
            completionTokens: 4,
            promptFilterResults: [
                {
                    prompt_index: 0,
                    content_filter_results: {
                        hate: { filtered: false, severity: "safe" },
                        sexual: { filtered: false, severity: "safe" },
                    },
                },
            ],
            completionFilterResults: {
                violence: { filtered: false, severity: "medium" },
            },
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
            prompt_filter_results: selectedCase?.promptFilterResults,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: selectedCase?.content ?? "snapshot response",
                    },
                    finish_reason: selectedCase?.finishReason || "stop",
                    content_filter_results:
                        selectedCase?.completionFilterResults,
                },
            ],
            usage: {
                prompt_tokens: selectedCase?.promptTokens || 7,
                completion_tokens: selectedCase?.completionTokens || 3,
                total_tokens:
                    (selectedCase?.promptTokens || 7) +
                    (selectedCase?.completionTokens || 3),
                ...selectedCase?.usageExtras,
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

test("chat completions bill provider-reported Perplexity request cost without exposing it", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "perplexity-fast",
            messages: [
                { role: "user", content: "vcr perplexity reported cost" },
            ],
        }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        usage?: Record<string, unknown>;
    };
    expect(body.usage).toMatchObject({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
    });
    expect(body.usage).not.toHaveProperty("cost");
    expect(body.usage).not.toHaveProperty("search_context_size");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "perplexity-fast",
        tokenCountPromptText: 10,
        tokenCountCompletionText: 5,
        isBilledUsage: true,
        adjustmentUnits: { "perplexity.sonar_low.search_request.v1": 1 },
        adjustmentCosts: { "perplexity.sonar_low.search_request.v1": 0.006 },
        adjustmentPrices: { "perplexity.sonar_low.search_request.v1": 0.006 },
    });
    expect(mocks.tinybird.state.events[0].totalCost).toBeCloseTo(0.006015, 8);
});

test("streaming chat completions bill provider-reported Perplexity request cost", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "perplexity-fast",
            stream: true,
            messages: [{ role: "user", content: "vcr perplexity stream cost" }],
        }),
    });

    expect(response.status).toBe(200);
    await response.text();
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "perplexity-fast",
        tokenCountPromptText: 7,
        tokenCountCompletionText: 3,
        isBilledUsage: true,
        adjustmentUnits: { "perplexity.sonar_low.search_request.v1": 1 },
        adjustmentCosts: { "perplexity.sonar_low.search_request.v1": 0.007 },
        adjustmentPrices: { "perplexity.sonar_low.search_request.v1": 0.007 },
    });
    // 0.007 provider-reported request fee + 0.00001 token cost.
    expect(mocks.tinybird.state.events[0].totalCost).toBeCloseTo(0.00701, 8);
});

test("malformed provider-reported cost bills static fallback without failing the request", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "perplexity-fast",
            messages: [
                { role: "user", content: "vcr perplexity invalid cost" },
            ],
        }),
    });

    expect(response.status).toBe(200);
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "perplexity-fast",
        tokenCountPromptText: 10,
        tokenCountCompletionText: 5,
        isBilledUsage: true,
        adjustmentUnits: { "perplexity.sonar_low.search_request.v1": 1 },
        adjustmentCosts: { "perplexity.sonar_low.search_request.v1": 0.005 },
        adjustmentPrices: { "perplexity.sonar_low.search_request.v1": 0.005 },
    });
    expect(mocks.tinybird.state.events[0].totalCost).toBeCloseTo(0.005015, 8);
});

test("non-stream chat completions keep moderation telemetry in generation events", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "vcr moderated text" }],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-moderation-prompt-hate-severity")).toBe(
        "safe",
    );
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "openai-fast",
        moderationPromptHateSeverity: "safe",
        moderationPromptSexualSeverity: "safe",
        moderationCompletionViolenceSeverity: "medium",
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

test("POST /text passes through empty assistant content", async ({
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
            messages: [{ role: "user", content: "vcr empty text" }],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        requestPath: "/text",
        tokenCountPromptText: 5,
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

test("flux image generation uses Fireworks serverless from gen", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");

    const { response, wait } = await fetchWorker(
        "/image/vcr%20red%20square?model=flux&width=1280&height=720&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    const failureBody =
        response.status === 200 ? "" : await response.clone().text();
    expect(response.status, failureBody).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    await wait();

    expect(mocks.fireworks.state.requests).toHaveLength(1);
    expect(mocks.fireworks.state.requests[0]).toMatchObject({
        url: "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image",
        body: {
            prompt: "vcr red square",
            aspect_ratio: "16:9",
            num_inference_steps: 4,
            seed: 42,
        },
        headers: {
            accept: "image/jpeg",
            authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
            "content-type": "application/json",
        },
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "flux",
        tokenCountCompletionImage: 1,
        isBilledUsage: true,
    });
});

test("image backend validation errors return client-facing 400", async ({
    paidApiKey,
    mocks,
}) => {
    const existing = await env.KV.list({ prefix: "image:server:test:zimage:" });
    await Promise.all(existing.keys.map((k) => env.KV.delete(k.name)));

    const { response: registerResponse } = await fetchWorker("/register", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.PLN_GPU_TOKEN}`,
        },
        body: JSON.stringify({
            url: `https://${imageBackendHost}`,
            type: "zimage",
        }),
    });
    expect(registerResponse.status).toBe(200);
    await mocks.enable("tinybird", "imageBackend");

    const { response, wait } = await fetchWorker(
        "/image/too%20small?model=zimage&width=280&height=220&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message: "Invalid image request: height must be at least 256",
        },
    });
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "zimage",
        responseStatus: 400,
    });

    const { response: detailResponse, wait: waitDetail } = await fetchWorker(
        "/image/detail%20string?model=zimage&width=280&height=280&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(detailResponse.status).toBe(400);
    await expect(detailResponse.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message: "Invalid image request: prompt is too long",
        },
    });
    await waitDetail();

    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "zimage",
        responseStatus: 400,
    });

    const { response: provider400Response, wait: waitProvider400 } =
        await fetchWorker(
            "/image/plain%20upstream%20400?model=zimage&width=280&height=280&seed=42",
            {
                headers: { authorization: `Bearer ${paidApiKey}` },
            },
        );

    expect(provider400Response.status).toBe(400);
    await expect(provider400Response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message: "Image provider error: missing provider key",
        },
    });
    await waitProvider400();

    expect(mocks.tinybird.state.events).toHaveLength(3);
    expect(mocks.tinybird.state.events[2]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "zimage",
        responseStatus: 400,
    });

    // Upstream 400 with empty body must still surface a useful message via
    // HttpError.message, not collapse to a generic "Image provider error".
    const { response: emptyBody400Response, wait: waitEmptyBody400 } =
        await fetchWorker(
            "/image/empty%20body%20400?model=zimage&width=280&height=280&seed=42",
            {
                headers: { authorization: `Bearer ${paidApiKey}` },
            },
        );

    expect(emptyBody400Response.status).toBe(400);
    await expect(emptyBody400Response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message:
                "Image provider error: Image backend rejected request with status 400",
        },
    });
    await waitEmptyBody400();
});

test("malformed image edit multipart bodies return tracked 400", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const malformedMultipart = [
        "--bad",
        "Content-Disposition: form-data",
        "",
        "value",
        "--bad--",
        "",
    ].join("\r\n");

    const { response, wait } = await fetchWorker("/v1/images/edits", {
        method: "POST",
        headers: {
            "content-type": "multipart/form-data; boundary=bad",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: malformedMultipart,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message: "Invalid multipart form data",
        },
    });
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        responseStatus: 400,
    });
});

test("malformed audio transcription multipart bodies return tracked 400", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const malformedMultipart = [
        "--bad",
        "Content-Disposition: form-data",
        "",
        "value",
        "--bad--",
        "",
    ].join("\r\n");

    const { response, wait } = await fetchWorker("/v1/audio/transcriptions", {
        method: "POST",
        headers: {
            "content-type": "multipart/form-data; boundary=bad",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: malformedMultipart,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message: "Invalid multipart form data",
        },
    });
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.audio",
        responseStatus: 400,
    });
});
