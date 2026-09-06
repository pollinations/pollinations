import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    test as baseTest,
    createTestApiKey,
} from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { createMockVcr } from "@shared/test/mocks/vcr.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, inject } from "vitest";
import worker from "../src/index.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

const snapshotServerUrl = inject("snapshotServerUrl");
const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==";
const imageBackendHost = "image-backend.test";
const deepInfraHost = "api.deepinfra.com";
const replicateHost = "api.replicate.com";
const replicateDeliveryHost = "replicate.delivery";

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
    env.AZURE_MYCELI_PROD_IMG_2_SWEDEN_API_KEY =
        "azure-gpt-image-2-sweden-test-key";
    env.AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY =
        "azure-gpt-image-2-eastus2-test-key";
    env.OPENAI_API_KEY = "openai-test-key";
    env.OPENROUTER_API_KEY = "openrouter-test-key";
    env.AZURE_MYCELI_PROD_API_KEY = "azure-test-key";
    env.DEEPINFRA_API_KEY = "deepinfra-test-key";
    env.REPLICATE_API_TOKEN = "replicate-test-key";
    const portkeyHost = new URL(env.PORTKEY_GATEWAY_URL).host;
    const portkeyState: { requests: Record<string, unknown>[] } = {
        requests: [],
    };
    const replicateState: {
        requests: Array<{
            body: Record<string, unknown>;
            headers: Record<string, string>;
            url: string;
        }>;
    } = { requests: [] };
    const responsesState: {
        requests: Array<{
            body: Record<string, unknown>;
            headers: Record<string, string>;
        }>;
        omitUsage: boolean;
        failStream: boolean;
        wrongStreamContentType: boolean;
        terminalTypeInEventOnly: boolean;
    } = {
        requests: [],
        omitUsage: false,
        failStream: false,
        wrongStreamContentType: false,
        terminalTypeInEventOnly: false,
    };
    const deepInfraState: { requests: Record<string, unknown>[] } = {
        requests: [],
    };
    const responsesHandler = async (request: Request) => {
        const body = (await request.clone().json()) as Record<string, unknown>;
        responsesState.requests.push({
            body,
            headers: Object.fromEntries(request.headers.entries()),
        });
        const response = {
            id: "resp_direct_test",
            object: "response",
            model: body.model,
            status: "completed",
            output: [
                {
                    id: "msg_direct_test",
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [
                        {
                            type: "output_text",
                            text: "direct response",
                            annotations: [],
                        },
                    ],
                },
            ],
            usage: {
                input_tokens: 12,
                input_tokens_details: {
                    cached_tokens: 2,
                    cache_write_tokens: 1,
                },
                output_tokens: 7,
                output_tokens_details: { reasoning_tokens: 3 },
                total_tokens: 19,
            },
        };
        if (responsesState.omitUsage) {
            delete (response as { usage?: unknown }).usage;
        }
        if (body.stream) {
            if (responsesState.wrongStreamContentType) {
                return Response.json(response);
            }
            if (responsesState.failStream) {
                return new Response(
                    'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","error":{"message":"provider failed"},"usage":null}}\n\n',
                    { headers: { "content-type": "text/event-stream" } },
                );
            }
            const terminalEvent = {
                ...(responsesState.terminalTypeInEventOnly
                    ? {}
                    : { type: "response.completed" }),
                response,
            };
            const invalidUsageChunk =
                body.input === "vcr invalid usage after valid usage"
                    ? `event: response.completed\ndata: ${JSON.stringify({
                          type: "response.completed",
                          response: {
                              ...response,
                              usage: { input_tokens: 12 },
                          },
                      })}\n\n`
                    : "";
            return new Response(
                `event: response.output_text.delta\ndata: ${JSON.stringify({
                    type: "response.output_text.delta",
                    delta: "direct response",
                })}\n\nevent: response.completed\ndata: ${JSON.stringify(terminalEvent)}\n\n${invalidUsageChunk}`,
                { headers: { "content-type": "text/event-stream" } },
            );
        }
        return Response.json(response);
    };
    const gptImageState: {
        azureStatus: number;
        openAIRequests: Record<string, unknown>[];
        imageHostRequests: number;
    } = {
        azureStatus: 429,
        openAIRequests: [],
        imageHostRequests: 0,
    };
    return createFetchMock({
        tinybird: createMockTinybird(),
        portkeyDirect: {
            state: portkeyState,
            handlerMap: {
                [portkeyHost]: async (request) => {
                    portkeyState.requests.push(
                        (await request.clone().json()) as Record<
                            string,
                            unknown
                        >,
                    );
                    return fakePortkeyResponse(request);
                },
            },
            reset: () => {
                portkeyState.requests = [];
            },
        },
        responsesDirect: {
            state: responsesState,
            handlerMap: {
                "openrouter.ai": responsesHandler,
                "myceli-prod-eastus.openai.azure.com": responsesHandler,
            },
            reset: () => {
                responsesState.requests = [];
                responsesState.omitUsage = false;
                responsesState.failStream = false;
                responsesState.wrongStreamContentType = false;
                responsesState.terminalTypeInEventOnly = false;
            },
        },
        imageBackend: {
            state: {},
            handlerMap: {
                [imageBackendHost]: fakeImageBackendResponse,
            },
            reset: () => {},
        },
        deepInfra: {
            state: deepInfraState,
            handlerMap: {
                [deepInfraHost]: async (request) => {
                    deepInfraState.requests.push(
                        (await request.json()) as Record<string, unknown>,
                    );
                    return Response.json({
                        images: [png1x1Base64],
                        inference_status: { cost: 0.0005, runtime_ms: 100 },
                    });
                },
            },
            reset: () => {
                deepInfraState.requests = [];
            },
        },
        gptImage: {
            state: gptImageState,
            handlerMap: {
                "gpt-reference.test": async () => {
                    gptImageState.imageHostRequests++;
                    return gptImageState.imageHostRequests === 1
                        ? new Response("over capacity", { status: 429 })
                        : new Response(Buffer.from(png1x1Base64, "base64"), {
                              headers: { "content-type": "image/png" },
                          });
                },
                "content-safety.test": async () =>
                    Response.json({ categoriesAnalysis: [] }),
                "gptimagemain1-resource.cognitiveservices.azure.com":
                    async () => Response.json({ categoriesAnalysis: [] }),
                "myceli-prod-img-2-swedencentral.cognitiveservices.azure.com":
                    async () =>
                        Response.json(
                            { error: { code: "RateLimitReached" } },
                            { status: gptImageState.azureStatus },
                        ),
                "myceli-prod-img-2-eastus2.cognitiveservices.azure.com":
                    async () =>
                        Response.json(
                            { error: { code: "RateLimitReached" } },
                            { status: gptImageState.azureStatus },
                        ),
                "api.openai.com": async (request) => {
                    gptImageState.openAIRequests.push(
                        request.headers
                            .get("content-type")
                            ?.includes("multipart/form-data")
                            ? Object.fromEntries(await request.formData())
                            : ((await request.json()) as Record<
                                  string,
                                  unknown
                              >),
                    );
                    return Response.json({
                        data: [{ b64_json: png1x1Base64 }],
                        usage: {
                            input_tokens: 10,
                            output_tokens: 20,
                            input_tokens_details: {
                                text_tokens: 10,
                                image_tokens: 0,
                            },
                        },
                    });
                },
            },
            reset: () => {
                gptImageState.azureStatus = 429;
                gptImageState.openAIRequests = [];
                gptImageState.imageHostRequests = 0;
            },
        },
        replicate: {
            state: replicateState,
            handlerMap: {
                [replicateHost]: (request) =>
                    fakeReplicateFluxResponse(request, replicateState),
                [replicateDeliveryHost]: async () =>
                    new Response(Buffer.from(png1x1Base64, "base64"), {
                        headers: { "content-type": "image/jpeg" },
                    }),
            },
            reset: () => {
                replicateState.requests = [];
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

async function fakeReplicateFluxResponse(
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

    return Response.json(
        {
            id: "flux-prediction",
            status: "succeeded",
            output: ["https://replicate.delivery/flux-output.jpg"],
            metrics: { predict_time: 0.5 },
        },
        { status: 201 },
    );
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
    const reportedModel = prompt.includes("provider model mismatch")
        ? "provider-model-version"
        : model;

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
            model: reportedModel,
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
        const usageChunk = prompt.includes("vcr missing chat stream usage")
            ? ""
            : `data: ${JSON.stringify(usageEvent)}\n\n`;
        const invalidUsageChunk = prompt.includes(
            "vcr invalid usage after valid usage",
        )
            ? `data: ${JSON.stringify({ ...usageEvent, usage: { prompt_tokens: 7 } })}\n\n`
            : "";
        const earlyUsageChunk = prompt.includes("vcr early usage")
            ? `data: ${JSON.stringify({
                  ...streamEvent,
                  usage: prompt.includes("partial")
                      ? { prompt_tokens: 7 }
                      : {
                            prompt_tokens: 7,
                            completion_tokens: 0,
                            total_tokens: 7,
                        },
              })}\n\n`
            : "";
        return new Response(
            `${earlyUsageChunk}data: ${JSON.stringify(streamEvent)}\n\n${usageChunk}${invalidUsageChunk}data: [DONE]\n\n`,
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

    if (prompt.includes("vcr response extensions")) {
        return Response.json({
            provider_response_option: { trace: "kept" },
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "first" },
                    finish_reason: "stop",
                    provider_choice_option: "first-kept",
                },
                {
                    index: 1,
                    message: { role: "assistant", content: "second" },
                    finish_reason: "stop",
                    provider_choice_option: "second-kept",
                },
            ],
            usage: {
                prompt_tokens: 4,
                completion_tokens: 2,
                total_tokens: 6,
                provider_usage_option: { cached: 1 },
                search_context_size: "low",
                cost: { total_cost: 0.000006 },
            },
        });
    }

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
            model: reportedModel,
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
            ...(prompt.includes("vcr missing chat usage")
                ? {}
                : {
                      usage: {
                          prompt_tokens: selectedCase?.promptTokens || 7,
                          completion_tokens:
                              selectedCase?.completionTokens || 3,
                          total_tokens:
                              (selectedCase?.promptTokens || 7) +
                              (selectedCase?.completionTokens || 3),
                          ...selectedCase?.usageExtras,
                      },
                  }),
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
        withInlineGenerationCoordinator(env),
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

test("chat completions reject a successful envelope without usage", async ({
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
            messages: [{ role: "user", content: "vcr missing chat usage" }],
        }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
        error: {
            code: "BAD_GATEWAY",
            message: expect.stringContaining("omitted usage"),
        },
    });
    await wait();

    expect(mocks.portkeyDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
    });
});

test("chat streaming without usage fails closed and remains unbilled", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");
    const caller = await createTestApiKey({
        name: "missing-chat-stream-usage",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            stream: true,
            messages: [
                { role: "user", content: "vcr missing chat stream usage" },
            ],
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"code":"usage_missing"');
    expect(stream).not.toContain("[DONE]");
    await wait();

    expect(mocks.portkeyDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "usage_missing",
    });
    expect(mocks.tinybird.state.errorEvents).toHaveLength(1);
    expect(mocks.tinybird.state.errorEvents[0]).toMatchObject({
        status: 502,
        upstream_status: 200,
        error_code: "usage_missing",
        upstream_body: expect.any(String),
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test.for([
    "/v1/chat/completions",
    "/v1/responses",
])("%s does not bill valid usage followed by a stream validation error", async (path, {
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect", "responsesDirect");
    const caller = await createTestApiKey({
        name: "invalid-usage-after-valid-usage",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);
    const prompt = "vcr invalid usage after valid usage";
    const { response, wait } = await fetchWorker(path, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            stream: true,
            ...(path === "/v1/responses"
                ? { model: "qwen-large", input: prompt }
                : {
                      model: "openai-fast",
                      messages: [{ role: "user", content: prompt }],
                  }),
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"total_tokens":');
    expect(stream).toContain('"code":"usage_missing"');
    expect(stream).not.toContain("[DONE]");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "usage_missing",
    });
    expect(mocks.tinybird.state.events[0].totalCost).toBeGreaterThan(0);
    expect(mocks.tinybird.state.errorEvents).toHaveLength(1);
    expect(mocks.tinybird.state.errorEvents[0]).toMatchObject({
        status: 502,
        upstream_status: 200,
        error_code: "usage_missing",
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test.for([
    "partial",
    "valid",
])("chat bills final usage after %s early usage", async (kind, { mocks }) => {
    await mocks.enable("tinybird", "portkeyDirect");
    const caller = await createTestApiKey({ user: { packBalance: 100 } });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);
    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            stream: true,
            messages: [{ role: "user", content: `vcr early usage ${kind}` }],
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("[DONE]");
    expect(stream).not.toContain("usage_missing");
    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        responseStatus: 200,
        isBilledUsage: true,
        tokenCountPromptText: 7,
        tokenCountCompletionText: 3,
    });
    expect(event.totalPrice).toBeGreaterThan(0);
    expect(mocks.tinybird.state.errorEvents).toHaveLength(0);
    const balanceAfter = await getUserBalance(db, caller.userId);
    expect(balanceBefore.packBalance - balanceAfter.packBalance).toBeCloseTo(
        event.totalPrice,
        12,
    );
});

test("Chat uses a native Responses target and preserves billing usage", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-5.6-luna",
            messages: [{ role: "user", content: "native Responses via Chat" }],
        }),
    });

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("gpt-5.6-luna");
    await expect(response.json()).resolves.toMatchObject({
        object: "chat.completion",
        choices: [
            {
                message: { role: "assistant", content: "direct response" },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 12,
            prompt_tokens_details: {
                cached_tokens: 2,
                cache_write_tokens: 1,
            },
            completion_tokens: 7,
            completion_tokens_details: { reasoning_tokens: 3 },
            total_tokens: 19,
        },
    });
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.responsesDirect.state.requests[0]).toMatchObject({
        body: {
            model: "gpt-5.6-luna",
            store: false,
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: "native Responses via Chat",
                        },
                    ],
                },
            ],
        },
        headers: { "api-key": "azure-test-key" },
    });
    expect(mocks.responsesDirect.state.requests[0].body).not.toHaveProperty(
        "messages",
    );
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "gpt-5.6-luna",
        modelUsed: "gpt-5.6-luna",
        tokenCountPromptText: 9,
        tokenCountPromptCached: 2,
        tokenCountPromptCacheWrite: 1,
        tokenCountCompletionText: 4,
        tokenCountCompletionReasoning: 3,
        isBilledUsage: true,
    });
});

test("Chat-over-Responses streaming converts events and bills terminal usage", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-5.6-luna",
            stream: true,
            messages: [{ role: "user", content: "adapted Responses stream" }],
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"object":"chat.completion.chunk"');
    expect(stream).toContain('"content":"direct response"');
    expect(stream).toContain('"cache_write_tokens":1');
    expect(stream).toContain("data: [DONE]");
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.responsesDirect.state.requests[0].body).toMatchObject({
        model: "gpt-5.6-luna",
        stream: true,
        store: false,
    });
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "gpt-5.6-luna",
        modelUsed: "gpt-5.6-luna",
        tokenCountPromptText: 9,
        tokenCountPromptCached: 2,
        tokenCountPromptCacheWrite: 1,
        tokenCountCompletionText: 4,
        tokenCountCompletionReasoning: 3,
        isBilledUsage: true,
    });
});

test("Chat-over-Responses stream without usage fails closed and remains unbilled", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.omitUsage = true;
    const caller = await createTestApiKey({
        name: "missing-adapted-responses-stream-usage",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "gpt-5.6-luna",
            stream: true,
            messages: [
                { role: "user", content: "missing adapted stream usage" },
            ],
        }),
    });

    expect(response.status, await response.clone().text()).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"code":"usage_missing"');
    expect(stream).not.toContain("[DONE]");
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        modelRequested: "gpt-5.6-luna",
        modelUsed: "gpt-5.6-luna",
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "usage_missing",
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test("Chat-over-Responses stream failure is tracked as an upstream error and remains unbilled", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.failStream = true;
    const caller = await createTestApiKey({
        name: "failed-adapted-responses-stream",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "gpt-5.6-luna",
            stream: true,
            messages: [{ role: "user", content: "provider failure" }],
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"message":"provider failed"');
    expect(stream).not.toContain("[DONE]");
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        modelRequested: "gpt-5.6-luna",
        modelUsed: "gpt-5.6-luna",
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "upstream_finish_reason_error",
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test("direct Responses JSON preserves protocol and bills once", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "direct responses json",
            text: {
                format: {
                    type: "json_schema",
                    name: "answer",
                    schema: { type: "object" },
                },
            },
            tools: [
                {
                    type: "function",
                    name: "lookup",
                    parameters: { type: "object" },
                },
            ],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("qwen-large");
    expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("9");
    expect(response.headers.get("x-usage-prompt-cached-tokens")).toBe("2");
    expect(response.headers.get("x-usage-prompt-cache-write-tokens")).toBe("1");
    expect(response.headers.get("x-usage-completion-text-tokens")).toBe("4");
    expect(response.headers.get("x-usage-completion-reasoning-tokens")).toBe(
        "3",
    );
    await expect(response.json()).resolves.toMatchObject({
        object: "response",
        status: "completed",
        output: [{ type: "message" }],
    });
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.responsesDirect.state.requests[0]).toMatchObject({
        body: {
            model: "qwen/qwen3.7-plus",
            input: "direct responses json",
            store: false,
            text: { format: { type: "json_schema" } },
            tools: [{ type: "function", name: "lookup" }],
        },
        headers: { authorization: "Bearer openrouter-test-key" },
    });
    expect(mocks.responsesDirect.state.requests[0].body).not.toHaveProperty(
        "messages",
    );
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        modelRequested: "qwen-large",
        modelUsed: "qwen-large",
        tokenCountPromptText: 9,
        tokenCountPromptCached: 2,
        tokenCountPromptCacheWrite: 1,
        tokenCountCompletionText: 4,
        tokenCountCompletionReasoning: 3,
        isBilledUsage: true,
    });
});

test("direct Responses JSON rejects a successful envelope without usage", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.omitUsage = true;

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "missing usage must fail",
        }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
        error: {
            code: "BAD_GATEWAY",
            message: expect.stringContaining("omitted usage"),
        },
    });
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
    });
});

test("direct Responses SSE is unchanged and terminal usage bills once", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "direct responses stream",
            stream: true,
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("event: response.output_text.delta");
    expect(stream).toContain('"type":"response.completed"');
    expect(stream).not.toContain("[DONE]");
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "qwen-large",
        tokenCountPromptText: 9,
        tokenCountPromptCached: 2,
        tokenCountCompletionText: 4,
        tokenCountCompletionReasoning: 3,
        isBilledUsage: true,
    });
});

test("direct Responses stream failure remains unbilled", async ({ mocks }) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.failStream = true;
    const caller = await createTestApiKey({
        name: "failed-native-responses-stream",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "provider failure",
            stream: true,
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"type":"response.failed"');
    expect(stream).not.toContain('"code":"usage_missing"');
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        modelRequested: "qwen-large",
        modelUsed: "qwen-large",
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "upstream_finish_reason_error",
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test("Responses streaming without usage fails closed and remains unbilled", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.omitUsage = true;
    const caller = await createTestApiKey({
        name: "missing-responses-stream-usage",
        user: { packBalance: 100 },
    });
    const db = drizzle(env.DB);
    const balanceBefore = await getUserBalance(db, caller.userId);

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${caller.key}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "missing Responses stream usage",
            stream: true,
        }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("event: error");
    expect(stream).toContain('"type":"error"');
    expect(stream).toContain('"code":"usage_missing"');
    expect(stream).not.toContain("event: response.completed");
    await wait();

    expect(mocks.responsesDirect.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
        totalPrice: 0,
        errorResponseCode: "usage_missing",
    });
    expect(await getUserBalance(db, caller.userId)).toEqual(balanceBefore);
});

test("direct Responses tracks terminal type supplied only by the SSE event field", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.terminalTypeInEventOnly = true;

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "event field terminal",
            stream: true,
        }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("event: response.completed");
    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        tokenCountPromptText: 9,
        tokenCountCompletionText: 4,
        isBilledUsage: true,
    });
});

test("direct Responses rejects a non-SSE upstream before rewriting content-type", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");
    mocks.responsesDirect.state.wrongStreamContentType = true;

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: "wrong content type",
            stream: true,
        }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
        error: { message: expect.stringContaining("content-type") },
    });
    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        responseStatus: 502,
        isBilledUsage: false,
    });
});

test("direct Responses returns 400 for reusable input state", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "responsesDirect");

    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "qwen-large",
            input: [{ type: "item_reference", id: "item_123" }],
        }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        error: {
            type: "invalid_request_error",
            param: "input",
        },
    });
    await wait();
    expect(mocks.responsesDirect.state.requests).toHaveLength(0);
});

test("Responses rejects models without a direct endpoint without calling Chat", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const { response, wait } = await fetchWorker("/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "step-flash",
            input: "must not adapt to chat",
        }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        error: {
            message: expect.stringContaining("stateless Responses API"),
        },
    });
    await wait();
    expect(mocks.portkeyDirect.state.requests).toHaveLength(0);
});

test("canonical model headers preserve provider-reported payload models", async ({
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
            messages: [
                { role: "user", content: "provider model mismatch json" },
            ],
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("openai-fast");
    await expect(response.json()).resolves.toMatchObject({
        model: "provider-model-version",
    });
    await wait();
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "openai-fast",
    });

    const { response: streamResponse, wait: waitForStream } = await fetchWorker(
        "/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${paidApiKey}`,
            },
            body: JSON.stringify({
                model: "openai-fast",
                stream: true,
                messages: [
                    {
                        role: "user",
                        content: "provider model mismatch stream",
                    },
                ],
            }),
        },
    );

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("x-model-used")).toBe("openai-fast");
    const streamBody = await streamResponse.text();
    expect(streamBody).toContain('"model":"provider-model-version"');
    expect(streamBody).not.toContain('"model":"openai-fast"');
    await waitForStream();
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        modelUsed: "openai-fast",
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

test("Perplexity aliases add no options and allow explicit override", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    for (const [model, requestedSize] of [
        ["perplexity-high", undefined],
        ["sonar-deep", "low"],
    ] as const) {
        const { response, wait } = await fetchWorker("/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${paidApiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: `context ${model}` }],
                ...(requestedSize && {
                    web_search_options: {
                        search_context_size: requestedSize,
                    },
                }),
            }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe("perplexity-fast");
        await response.text();
        await wait();
    }

    expect(mocks.portkeyDirect.state.requests).toHaveLength(2);
    expect(mocks.portkeyDirect.state.requests[0]).not.toHaveProperty(
        "web_search_options",
    );
    expect(mocks.portkeyDirect.state.requests[1]).toMatchObject({
        web_search_options: { search_context_size: "low" },
    });
});

test("rejects unsupported Perplexity search context sizes", async ({
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
            messages: [{ role: "user", content: "invalid context" }],
            web_search_options: { search_context_size: "medium" },
        }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
        error: {
            message:
                'Unsupported web_search_options.search_context_size. Use "low" or "high".',
        },
    });
    expect(mocks.portkeyDirect.state.requests).toHaveLength(0);
    await wait();
});

test("pins other Perplexity models high and strips search options elsewhere", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("portkeyDirect");

    for (const [model, searchContextSize] of [
        ["perplexity", "low"],
        ["perplexity-reasoning", "low"],
        ["openai-fast", "medium"],
    ] as const) {
        const { response, wait } = await fetchWorker("/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${paidApiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: `context ${model}` }],
                web_search_options: {
                    search_context_size: searchContextSize,
                },
            }),
        });

        expect(response.status).toBe(200);
        await response.text();
        await wait();
    }

    expect(mocks.portkeyDirect.state.requests).toHaveLength(3);
    expect(mocks.portkeyDirect.state.requests[0]).toMatchObject({
        web_search_options: { search_context_size: "high" },
    });
    expect(mocks.portkeyDirect.state.requests[1]).toMatchObject({
        web_search_options: { search_context_size: "high" },
    });
    expect(mocks.portkeyDirect.state.requests[2]).not.toHaveProperty(
        "web_search_options",
    );
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
    await response.arrayBuffer();
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

test("simple text forwards options through provider transforms once", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");

    const { response, wait } = await fetchWorker(
        "/text/vcr%20simple%20text?model=openai-fast&seed=-1&temperature=0.5&top_p=0.8&presence_penalty=0.2&frequency_penalty=-0.2&max_tokens=16&reasoning_effort=medium",
        { headers: { authorization: `Bearer ${paidApiKey}` } },
    );

    expect(response.status).toBe(200);
    await response.text();
    await wait();
    expect(mocks.portkeyDirect.state.requests).toHaveLength(1);
    expect(mocks.portkeyDirect.state.requests[0]).toMatchObject({
        model: "gpt-5-nano",
        seed: 42,
        temperature: 1,
        max_completion_tokens: 16,
        reasoning_effort: "medium",
        messages: [{ role: "user", content: "vcr simple text" }],
    });
    expect(mocks.portkeyDirect.state.requests[0]).not.toHaveProperty("top_p");
    expect(mocks.portkeyDirect.state.requests[0]).not.toHaveProperty(
        "presence_penalty",
    );
    expect(mocks.portkeyDirect.state.requests[0]).not.toHaveProperty(
        "frequency_penalty",
    );
});

test("chat responses preserve choices and extensions but hide private usage", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "portkeyDirect");
    const before = Math.floor(Date.now() / 1000);

    const { response, wait } = await fetchWorker("/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "openai-fast",
            messages: [{ role: "user", content: "vcr response extensions" }],
        }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown> & {
        choices: Array<Record<string, unknown>>;
        usage: Record<string, unknown>;
        created: number;
    };
    expect(body.created).toBeGreaterThanOrEqual(before);
    expect(body.created).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(body.provider_response_option).toEqual({ trace: "kept" });
    expect(body.choices).toHaveLength(2);
    expect(body.choices[0].provider_choice_option).toBe("first-kept");
    expect(body.choices[1].provider_choice_option).toBe("second-kept");
    expect(body.usage.provider_usage_option).toEqual({ cached: 1 });
    expect(body.usage).not.toHaveProperty("cost");
    expect(body.usage).not.toHaveProperty("search_context_size");
    await wait();
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

test("flux falls back to DeepInfra when the Vast pool is empty", async ({
    mocks,
}) => {
    const existing = await env.KV.list({ prefix: "image:server:test:flux:" });
    await Promise.all(existing.keys.map((k) => env.KV.delete(k.name)));
    await mocks.enable("tinybird", "deepInfra");
    const { key } = await createTestApiKey({
        allowedModels: ["flux"],
        user: { tierBalance: 100 },
    });

    const { response, wait } = await fetchWorker(
        "/image/vcr%20red%20square?model=flux&width=1280&height=720&seed=42",
        {
            headers: { authorization: `Bearer ${key}` },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-requested")).toBe("flux");
    expect(response.headers.get("x-model-used")).toBe("flux-deepinfra");
    expect(response.headers.get("x-fallback-target")).toBe("config.targets[1]");
    await response.arrayBuffer();
    await wait();

    expect(mocks.deepInfra.state.requests).toEqual([
        {
            prompt: "vcr red square",
            width: 1280,
            height: 720,
            num_images: 1,
            seed: 42,
        },
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "flux",
        resolvedModelRequested: "flux",
        modelUsed: "flux",
        modelProviderUsed: "vast",
        responseStatus: 503,
        isFinal: false,
        isBilledUsage: false,
    });
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "flux",
        resolvedModelRequested: "flux",
        modelUsed: "flux-deepinfra",
        modelProviderUsed: "deepinfra",
        responseStatus: 200,
        fallbackUsed: true,
        isFinal: true,
        isBilledUsage: true,
    });
});

test("fallback-only provider routes cannot be called directly", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird", "deepInfra");
    const { response, wait } = await fetchWorker(
        "/image/test?model=flux-deepinfra",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message:
                'Invalid model or alias: "flux-deepinfra". Must be a valid model name or alias.',
        },
    });
    await wait();

    expect(mocks.deepInfra.state.requests).toHaveLength(0);
});

test("OpenAI image generation returns token usage", async ({
    paidApiKey,
    mocks,
}) => {
    const existing = await env.KV.list({ prefix: "image:server:test:flux:" });
    await Promise.all(existing.keys.map((k) => env.KV.delete(k.name)));
    const { response: registerResponse } = await fetchWorker("/register", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.PLN_GPU_TOKEN}`,
        },
        body: JSON.stringify({
            url: `https://${imageBackendHost}`,
            type: "flux",
        }),
    });
    expect(registerResponse.status).toBe(200);
    await mocks.enable("tinybird", "imageBackend");

    const { response, wait } = await fetchWorker("/v1/images/generations", {
        method: "POST",
        headers: {
            authorization: `Bearer ${paidApiKey}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: "flux",
            prompt: "vcr red square",
            size: "1280x720",
            seed: 42,
            response_format: "b64_json",
        }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("HIT");
    expect(response.headers.get("x-cache-type")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
        data: [{ b64_json: expect.any(String) }],
        usage: {
            input_tokens: 0,
            output_tokens: 1,
            total_tokens: 1,
            input_tokens_details: {
                text_tokens: 0,
                image_tokens: 0,
            },
        },
    });
    await wait();
});

test("gpt-image-2 rejects transparent backgrounds with 400", async ({
    paidApiKey,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const { response, wait } = await fetchWorker("/v1/images/generations", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${paidApiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-image-2",
            prompt: "transparent",
            transparent: true,
        }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
            code: "BAD_REQUEST",
            message:
                "Invalid parameters: Transparent backgrounds are not supported by gpt-image-2.",
        },
    });
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "gpt-image-2",
        responseStatus: 400,
    });
});

test("gpt-image-2 falls back to OpenAI direct on an Azure 429", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "gptImage");
    const { key } = await createTestApiKey({
        allowedModels: ["gpt-image-2"],
        user: { tierBalance: 100 },
    });

    const { response, wait } = await fetchWorker(
        "/image/fallback%20probe?model=gpt-image-2&quality=low&seed=9347",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-requested")).toBe("gpt-image-2");
    expect(response.headers.get("x-model-used")).toBe("gpt-image-2-openai");
    expect(response.headers.get("x-fallback-target")).toBe("config.targets[1]");
    await response.arrayBuffer();
    await wait();

    expect(mocks.gptImage.state.openAIRequests).toEqual([
        expect.objectContaining({ model: "gpt-image-2" }),
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "gpt-image-2",
        modelProviderUsed: "azure",
        responseStatus: 502,
        isFinal: false,
    });
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        modelUsed: "gpt-image-2-openai",
        modelProviderUsed: "openai",
        responseStatus: 200,
        fallbackUsed: true,
        isFinal: true,
        isBilledUsage: true,
    });
});

test("gpt-image-2 tries its fallback when the reference image host is over capacity", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "gptImage");
    const { key } = await createTestApiKey({
        allowedModels: ["gpt-image-2"],
        user: { tierBalance: 100 },
    });
    const { response, wait } = await fetchWorker(
        "/image/image-host-capacity?model=gpt-image-2&quality=low&width=1024&height=1024&image=https%3A%2F%2Fgpt-reference.test%2Finput.png&seed=9350",
        { headers: { authorization: `Bearer ${key}` } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("gpt-image-2-openai");
    expect(response.headers.get("x-fallback-target")).toBe("config.targets[1]");
    await response.arrayBuffer();
    await wait();
    expect(mocks.gptImage.state.imageHostRequests).toBe(2);
    expect(mocks.gptImage.state.openAIRequests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        // Failed-attempt telemetry maps the image host's 429 to a gateway failure.
        responseStatus: 502,
        isFinal: false,
        isBilledUsage: false,
    });
    expect(mocks.tinybird.state.events[1]).toMatchObject({
        responseStatus: 200,
        fallbackUsed: true,
        isFinal: true,
        isBilledUsage: true,
    });
});

test("gpt-image-2 does not duplicate an ambiguous Azure timeout", async ({
    mocks,
}) => {
    await mocks.enable("tinybird", "gptImage");
    mocks.gptImage.state.azureStatus = 524;
    const { key } = await createTestApiKey({
        allowedModels: ["gpt-image-2"],
        user: { tierBalance: 100 },
    });

    const { response, wait } = await fetchWorker(
        "/image/timeout%20probe?model=gpt-image-2&quality=low&seed=9348",
        { headers: { authorization: `Bearer ${key}` } },
    );

    expect(response.status).toBe(502);
    await response.arrayBuffer();
    await wait();
    expect(mocks.gptImage.state.openAIRequests).toHaveLength(0);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelUsed: "gpt-image-2",
        modelProviderUsed: "azure",
        responseStatus: 502,
        isFinal: true,
        isBilledUsage: false,
    });
});

test("the sana alias routes to the dreamshaper pool and records its flat price", async ({
    paidApiKey,
    mocks,
}) => {
    const existing = await env.KV.list({ prefix: "image:server:test:sana:" });
    await Promise.all(existing.keys.map((k) => env.KV.delete(k.name)));

    // pool key is still "sana" so workers can register before this deploys
    const { response: registerResponse } = await fetchWorker("/register", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.PLN_GPU_TOKEN}`,
        },
        body: JSON.stringify({
            url: `https://${imageBackendHost}`,
            type: "sana",
        }),
    });
    expect(registerResponse.status).toBe(200);
    await mocks.enable("tinybird", "imageBackend");

    // Requested as "sana" on purpose: the old name has to keep working for the
    // legacy image proxy worker and existing callers.
    const { response, wait } = await fetchWorker(
        "/image/fast%20flower?model=sana&width=512&height=512&seed=42",
        {
            headers: { authorization: `Bearer ${paidApiKey}` },
        },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("dreamshaper");
    await response.arrayBuffer();
    await wait();

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.image",
        // analytics keep the name the caller actually used
        modelRequested: "sana",
        modelUsed: "dreamshaper",
        tokenCountCompletionImage: 1,
        tokenPriceCompletionImage: 0.0001,
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
            message: "Image backend rejected request with status 422",
            details: {
                upstreamStatus: 422,
                upstreamBody: JSON.stringify({
                    detail: [
                        {
                            type: "greater_than_equal",
                            loc: ["body", "height"],
                            msg: "Input should be greater than or equal to 256",
                            input: 220,
                            ctx: { ge: 256 },
                        },
                    ],
                }),
            },
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
            message: "Image backend rejected request with status 422",
            details: {
                upstreamStatus: 422,
                upstreamBody: JSON.stringify({ detail: "prompt is too long" }),
            },
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
            message: "Image backend rejected request with status 400",
            details: {
                upstreamStatus: 400,
                upstreamBody: JSON.stringify({
                    message: "missing provider key",
                }),
            },
        },
    });
    await waitProvider400();

    expect(mocks.tinybird.state.events).toHaveLength(3);
    expect(mocks.tinybird.state.events[2]).toMatchObject({
        eventType: "generate.image",
        modelRequested: "zimage",
        responseStatus: 400,
    });

    // An empty upstream body still carries the backend status in the message.
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
            message: "Image backend rejected request with status 400",
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
