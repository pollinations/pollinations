import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { mediaItem, mediaTag } from "@shared/db/media-catalog.ts";
import { createTestApiKey } from "@shared/test/fixtures/api-keys.ts";
import { test as baseTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { createMockVcr } from "@shared/test/mocks/vcr.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
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
    // Non-adjustment model → the Map columns must be absent from the payload so
    // ClickHouse's DEFAULT map() fills them (removeUnset dropped the undefineds).
    expect(mocks.tinybird.state.events[0]).not.toHaveProperty(
        "adjustmentCosts",
    );
    expect(mocks.tinybird.state.events[0]).not.toHaveProperty(
        "adjustmentUnits",
    );
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
    });
    expect(mocks.tinybird.state.events[0].totalCost).toBeCloseTo(0.006015, 8);
    // Itemized search fee rides along in the Map columns, keyed by rule id.
    expect(mocks.tinybird.state.events[0].adjustmentCosts).toEqual({
        "perplexity.sonar_low.search_request.v1": 0.006,
    });
    expect(mocks.tinybird.state.events[0].adjustmentUnits).toEqual({
        "perplexity.sonar_low.search_request.v1": 1,
    });
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
    });
    // 0.007 provider-reported request fee + 0.00001 token cost.
    expect(mocks.tinybird.state.events[0].totalCost).toBeCloseTo(0.00701, 8);
});

test("malformed provider-reported cost bills the static fee, not a 5xx", async ({
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

    // Clamp-and-alert: a malformed provider cost on an otherwise-good
    // generation no longer fails the request. The response succeeds and the
    // request is billed at the static registry fee.
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        usage?: Record<string, unknown>;
    };
    expect(body.usage).not.toHaveProperty("cost");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "perplexity-fast",
        tokenCountPromptText: 10,
        tokenCountCompletionText: 5,
        isBilledUsage: true,
    });
    // 0.005 static request fee + 0.000015 token cost (10 prompt + 5 completion
    // @ $1/1M). Provider request_cost was malformed → static fee substituted.
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

async function getCatalogRows(ownerUserId: string, locator: string) {
    const db = drizzle(env.DB);
    const items = await db
        .select()
        .from(mediaItem)
        .where(
            and(
                eq(mediaItem.ownerUserId, ownerUserId),
                eq(mediaItem.locator, locator),
            ),
        );
    const tagsByItem = new Map<string, string[]>();
    for (const item of items) {
        const tags = await db
            .select({ tag: mediaTag.tag })
            .from(mediaTag)
            .where(eq(mediaTag.itemId, item.id));
        tagsByItem.set(
            item.id,
            tags.map((t) => t.tag),
        );
    }
    return { items, tagsByItem };
}

test("tagged image generation catalogs the generation in D1", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-test-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20tagged%20square?height=720&model=flux&seed=42&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20tagged%20square?model=flux&width=1280&height=720&seed=42&tags=sunset",
        {
            headers: { authorization: `Bearer ${key}` },
        },
    );

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await wait();

    const { items, tagsByItem } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
        kind: "generation",
        ownerUserId: userId,
        locator,
    });
    expect(tagsByItem.get(items[0].id)).toEqual(["sunset"]);
});

test("retagging the same generation on a cache hit merges tags into one item", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-retag-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20retag%20square?height=720&model=flux&seed=43&width=1280";

    const first = await fetchWorker(
        "/image/vcr%20retag%20square?model=flux&width=1280&height=720&seed=43&tags=sunset",
        { headers: { authorization: `Bearer ${key}` } },
    );
    expect(first.response.status).toBe(200);
    await first.response.arrayBuffer();
    await first.wait();
    expect(mocks.fireworks.state.requests).toHaveLength(1);

    const second = await fetchWorker(
        "/image/vcr%20retag%20square?model=flux&width=1280&height=720&seed=43&tags=beach",
        { headers: { authorization: `Bearer ${key}` } },
    );
    expect(second.response.status).toBe(200);
    expect(second.response.headers.get("x-cache")).toBe("HIT");
    await second.response.arrayBuffer();
    await second.wait();

    // Cache hit — no second upstream call.
    expect(mocks.fireworks.state.requests).toHaveLength(1);

    const { items, tagsByItem } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(1);
    expect(tagsByItem.get(items[0].id)?.sort()).toEqual(["beach", "sunset"]);
});

test("tagging with an invalid tag returns 400 and writes no catalog row", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-invalid-tag-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20invalid%20tag%20square?height=720&model=flux&seed=44&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20invalid%20tag%20square?model=flux&width=1280&height=720&seed=44&tags=UPPER!",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(400);
    await response.json();
    await wait();
    expect(mocks.fireworks.state.requests).toHaveLength(0);

    const { items } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(0);
});

test("singular tag query does not catalog the generation", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-singular-tag-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20singular%20tag%20square?height=720&model=flux&seed=46&width=1280";
    const locatorWithTag =
        "https://gen.pollinations.ai/image/vcr%20singular%20tag%20square?height=720&model=flux&seed=46&tag=sunset&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20singular%20tag%20square?model=flux&width=1280&height=720&seed=46&tag=sunset",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(200);
    await wait();
    expect(mocks.fireworks.state.requests).toHaveLength(1);

    const { items } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(0);
    const { items: taggedLocatorItems } = await getCatalogRows(
        userId,
        locatorWithTag,
    );
    expect(taggedLocatorItems).toHaveLength(0);
});

test("empty tags param behaves like no tags — nothing cataloged", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-empty-tags-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20empty%20tags%20square?height=720&model=flux&seed=48&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20empty%20tags%20square?model=flux&width=1280&height=720&seed=48&tags=",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await wait();

    const { items } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(0);
});

test("tagging without an API key returns 400", async ({ mocks }) => {
    await mocks.enable("tinybird", "fireworks");

    const { response, wait } = await fetchWorker(
        "/image/vcr%20anon%20tag%20square?model=flux&width=1280&height=720&seed=45&tags=sunset",
        {},
    );

    // auth() middleware doesn't require a user (anonymous requests reach the
    // handler chain); generationAccess enforces auth but runs after
    // mediaCatalog, so the tagging check itself is what rejects this — not
    // an earlier 401/403 from auth.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
        error: "tagging requires a user-owned API key",
    });
    await wait();
});

test("comma-separated tags are all stored", async ({ mocks }) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-multi-tag-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20multi%20tag%20square?height=720&model=flux&seed=47&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20multi%20tag%20square?model=flux&width=1280&height=720&seed=47&tags=sunset,beach,sea,sky",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await wait();

    const { items, tagsByItem } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(1);
    expect(tagsByItem.get(items[0].id)?.sort()).toEqual([
        "beach",
        "sea",
        "sky",
        "sunset",
    ]);
});

test("untagged generation is not cataloged", async ({ mocks }) => {
    await mocks.enable("tinybird", "fireworks");
    const { key, userId } = await createTestApiKey({
        name: "catalog-untagged-key",
        user: { packBalance: 100 },
    });

    const locator =
        "https://gen.pollinations.ai/image/vcr%20untagged%20square?height=720&model=flux&seed=46&width=1280";

    const { response, wait } = await fetchWorker(
        "/image/vcr%20untagged%20square?model=flux&width=1280&height=720&seed=46",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await wait();

    const { items } = await getCatalogRows(userId, locator);
    expect(items).toHaveLength(0);
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
