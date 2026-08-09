import { UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    MODEL_USED_HEADER,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import {
    CreateChatCompletionResponseSchema,
    type CreateResponseRequest,
} from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import {
    type FallbackCandidate,
    fallbackCandidates,
    withModelFallback,
} from "../fallback.ts";
import { fixWavHeader } from "../routes/audio.js";
import { communityEndpointGatewayContext } from "./communityEndpoint.ts";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { type ExpressLikeRequest, getRequestData } from "./requestUtils.js";
import {
    chatCompletionToResponse,
    responseRequestToChatRequest,
    responsesErrorResponse,
    responsesStreamResponse,
} from "./responses.js";
import type {
    ChatCompletion,
    RequestData,
    ServiceError,
    TransformOptions,
} from "./types.js";

type TextContext = Context<Env>;

const TEXT_ENV_KEYS = [
    "AI_GATEWAY_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_MYCELI_PROD_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "DEEPINFRA_API_KEY",
    "FIREWORKS_NEO_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "OPENROUTER_API_KEY",
    "OVHCLOUD_API_KEY",
    "PERPLEXITY_API_KEY",
    "PORTKEY_GATEWAY_URL",
] as const satisfies readonly (keyof CloudflareBindings)[];

function syncTextEnvironment(env: CloudflareBindings): void {
    // Text provider config still reads process.env. In Workers all bindings are
    // stable per deployment, so copying known string bindings before generation
    // is deterministic across concurrent requests in the same isolate.
    for (const key of TEXT_ENV_KEYS) {
        const value = env[key];
        if (typeof value === "string") {
            process.env[key] = value;
        }
    }
}

function generatePollinationsId(): string {
    return `pllns_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createExpressLikeRequest(
    c: TextContext,
    body: Record<string, unknown>,
    path: string,
    params: Record<string, string> = {},
): ExpressLikeRequest {
    return {
        query: Object.fromEntries(new URL(c.req.url).searchParams),
        body,
        path,
        params,
        method: c.req.method,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        url: c.req.url,
    };
}

function prepareRequestParameters(
    requestParams: RequestData,
    modelDefinition: ModelDefinition,
): RequestData {
    const isAudioModel =
        modelDefinition.outputModalities?.includes("audio") ?? false;
    if (!isAudioModel) return requestParams;

    const voice = requestParams.voice || requestParams.audio?.voice || "alloy";
    const audioFormat = requestParams.stream ? "pcm16" : "mp3";

    return {
        ...requestParams,
        modalities: requestParams.modalities || ["text", "audio"],
        audio: requestParams.audio
            ? {
                  ...requestParams.audio,
                  format: requestParams.audio.format || audioFormat,
              }
            : { voice, format: audioFormat },
    };
}

/**
 * How to reach one candidate's provider.
 *
 * Built per attempt rather than once up front, so a delegating fallback mints
 * its own run token and no attempt ever carries another endpoint's credential.
 */
function gatewayContext(
    c: TextContext,
    requestData: RequestData,
    candidate: FallbackCandidate,
): Promise<TransformOptions> | TransformOptions {
    const { communityEndpoint, definition } = candidate;
    // A fallback must resolve transforms from the model that will actually run.
    const candidateRequest = candidate.entry
        ? { ...requestData, model: candidate.id }
        : requestData;
    // Paired by fallbackCandidates: a community endpoint always arrives with the
    // definition that prices it. Anything else is a static model, whose provider
    // config the gateway resolves from the model id.
    if (!communityEndpoint || !definition) {
        return withGatewayContext(c, candidateRequest);
    }
    return communityEndpointGatewayContext(
        communityEndpoint,
        definition,
        candidateRequest,
        c.env.BETTER_AUTH_SECRET,
        c.env.PORTKEY_GATEWAY_URL,
        c.var.auth?.apiKey?.rawKey || "",
        c.var.auth?.apiKey?.id,
    );
}

function withGatewayContext(c: TextContext, requestData: RequestData) {
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;

    return {
        ...requestDataWithoutMessages,
        userApiKey: c.var.auth?.apiKey?.rawKey || "",
        portkeyGatewayUrl: c.env.PORTKEY_GATEWAY_URL,
    };
}

/**
 * `servedModelId` is our id for the model that ran, and it wins over the name
 * the provider reports for itself. A community endpoint answers with its
 * upstream's name — "gemini-2.0-flash" for what we and its owner both call
 * "alice/pro" — which names something nobody can act on, and after a fallback
 * names the wrong party's model.
 */
function usageHeaders(
    completion: ChatCompletion,
    servedModelId?: string,
): Headers {
    const headers = new Headers();
    const modelUsed = servedModelId || completion?.model;
    if (modelUsed) {
        const usage = completion?.usage;
        const normalizedUsage = usage
            ? openaiUsageToUsage(
                  usage as unknown as Parameters<typeof openaiUsageToUsage>[0],
              )
            : undefined;
        for (const [key, value] of Object.entries(
            buildUsageHeaders(modelUsed, normalizedUsage),
        )) {
            headers.set(key, String(value));
        }
    }
    if (completion?.fallbackTarget) {
        headers.set(FALLBACK_TARGET_HEADER, completion.fallbackTarget);
    }
    return headers;
}

const PUBLIC_USAGE_FIELDS = new Set([
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "completion_tokens",
    "completion_tokens_details",
    "prompt_tokens",
    "prompt_tokens_details",
    "total_tokens",
]);

function publicCompletionUsage(
    usage: ChatCompletion["usage"],
): ChatCompletion["usage"] {
    if (!usage || (!("cost" in usage) && !("search_context_size" in usage))) {
        return usage;
    }

    return Object.fromEntries(
        Object.entries(usage).filter(([key]) => PUBLIC_USAGE_FIELDS.has(key)),
    );
}

function publicChatCompletion(completion: ChatCompletion): ChatCompletion {
    const usage = publicCompletionUsage(completion.usage);
    if (usage === completion.usage) return completion;

    const publicCompletion = {
        ...completion,
        usage,
    };
    if (completion.fallbackTarget !== undefined) {
        Object.defineProperty(publicCompletion, "fallbackTarget", {
            value: completion.fallbackTarget,
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return publicCompletion;
}

function sendOpenAIResponse(
    completion: ChatCompletion,
    servedModelId?: string,
): Response {
    const headers = usageHeaders(completion, servedModelId);
    headers.set("Content-Type", "application/json; charset=utf-8");

    return new Response(
        JSON.stringify({
            ...completion,
            id: completion.id || generatePollinationsId(),
            object: completion.object || "chat.completion",
            created: completion.created || Date.now(),
        }),
        { headers },
    );
}

function sendTextContentResponse(
    completion: ChatCompletion,
    servedModelId: string | undefined,
    upstreamRequestUrl: URL | undefined,
): Response {
    const headers = usageHeaders(completion, servedModelId);
    headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);

    if (!completion.choices?.[0]) {
        throw new UpstreamError(502, {
            message: "Unrecognized response format from text model",
            requestUrl: upstreamRequestUrl,
            responseBody: JSON.stringify(completion),
        });
    }

    const message = completion.choices[0].message;

    if (typeof message !== "object" || !message) {
        headers.set("Content-Type", "text/plain; charset=utf-8");
        return new Response(String(message), { headers });
    }

    const audio = message.audio as Record<string, unknown> | undefined;
    if (typeof audio?.data === "string") {
        const buffer = base64ToArrayBuffer(audio.data);
        const isWav =
            buffer.byteLength >= 12 &&
            new Uint8Array(buffer, 0, 4).reduce(
                (s, b) => s + String.fromCharCode(b),
                "",
            ) === "RIFF";
        if (isWav) {
            fixWavHeader(buffer);
            headers.set("Content-Type", "audio/wav");
        } else {
            headers.set("Content-Type", "audio/mpeg");
        }
        return new Response(buffer, { headers });
    }

    if (message.content !== undefined && message.content !== null) {
        let content = String(message.content);
        if (completion.citations?.length) {
            content += "\n\n---\nSources:\n";
            content += completion.citations
                .map((url: string, i: number) => `[${i + 1}] ${url}`)
                .join("\n");
            content += "\n";
        }
        headers.set("Content-Type", "text/plain; charset=utf-8");
        return new Response(content, { headers });
    }

    if (Object.keys(message).length > 0) {
        headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(message), { headers });
    }

    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response("", { headers });
}

function sendTextStreamResponse(
    completion: ChatCompletion,
    servedModelId?: string,
): Response {
    const headers = new Headers({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    // sendTextStreamResponse bypasses usageHeaders(), so set what tracking
    // reads off the worker response for streams here instead. Without the
    // model header a streamed generation is attributed to whatever name the
    // provider puts in its chunks, which after a rescue is the wrong owner's.
    if (servedModelId) {
        headers.set(MODEL_USED_HEADER, servedModelId);
    }
    if (completion.fallbackTarget) {
        headers.set(FALLBACK_TARGET_HEADER, completion.fallbackTarget);
    }

    if (completion.responseStream instanceof ReadableStream) {
        return new Response(completion.responseStream, { headers });
    }

    // Defensive: upstream produced a null stream body.
    const encoder = new TextEncoder();
    const fallbackStream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(
                encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: "Streaming response could not be processed." }, finish_reason: "stop", index: 0 }] })}\n\n`,
                ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    return new Response(fallbackStream, { headers });
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function serializeDetails(details: unknown): string | undefined {
    if (details === undefined || details === null) return undefined;
    return typeof details === "string" ? details : JSON.stringify(details);
}

function throwTextError(error: ServiceError): never {
    const status =
        typeof error.status === "number"
            ? error.status
            : typeof error.code === "number"
              ? error.code
              : 500;

    throw new UpstreamError(status as ContentfulStatusCode, {
        message: error.message || "Text generation failed",
        // Propagate only — the code is decided at the throw site.
        errorCode: error.errorCode,
        requestUrl: error.requestUrl,
        upstreamStatus: error.upstreamStatus,
        responseBody: serializeDetails(error.details || error.response?.data),
        upstreamHeaders: error.upstreamHeaders,
        cause: error,
    });
}

async function generateTextResponse(
    c: TextContext,
    requestData: RequestData,
    contentResponse: boolean,
): Promise<Response> {
    syncTextEnvironment(c.env);

    try {
        const normalization = normalizeSearchContext(c, requestData);
        if ("errorResponse" in normalization) {
            return normalization.errorResponse;
        }
        const normalizedRequestData = normalization.requestData;
        const portkey = c.env.PORTKEY;
        const {
            result: completion,
            candidate,
            index,
        } = await withModelFallback(
            fallbackCandidates(c.var.model),
            async (attempt) =>
                generateTextPortkey(
                    normalizedRequestData.messages,
                    await gatewayContext(c, normalizedRequestData, attempt),
                    portkey
                        ? (input, init) => portkey.fetch(input, init)
                        : undefined,
                ),
            c.var.track?.failedCalls,
        );
        c.set("upstreamRequestUrl", completion.upstreamRequestUrl);
        completion.id = completion.id || generatePollinationsId();
        if (index > 0) {
            // Same "config.targets[N]" shape a Portkey strategy would report, so
            // the response header and tracking's parsing cover both.
            completion.fallbackTarget = `config.targets[${index}]`;
        }

        // Cost and the owner reward follow what actually served, so record the
        // serving entry before the response (streaming included) leaves the
        // handler.
        const servedEntry = candidate.entry;
        if (servedEntry) c.set("servedModelEntry", servedEntry);

        // The successful candidate always carries the canonical registry id,
        // including aliases, community models, and fallback targets.
        const servedModelId = candidate.id || undefined;
        if (normalizedRequestData.stream)
            return sendTextStreamResponse(completion, servedModelId);
        // Provider-reported cost is read post-response in track (clamp-and-alert
        // in the registry) — malformed/absent cost never fails the request.
        const trackingResponse = sendOpenAIResponse(completion, servedModelId);
        const publicCompletion = publicChatCompletion(completion);
        if (contentResponse) {
            c.var.track?.overrideResponseTracking(trackingResponse.clone());
            return sendTextContentResponse(
                publicCompletion,
                servedModelId,
                c.var.upstreamRequestUrl,
            );
        }
        c.var.track?.overrideResponseTracking(trackingResponse.clone());
        return sendOpenAIResponse(publicCompletion, servedModelId);
    } catch (thrown: unknown) {
        throwTextError(thrown as ServiceError);
    }
}

function normalizeSearchContext(
    c: TextContext,
    requestData: RequestData,
): { requestData: RequestData } | { errorResponse: Response } {
    const { web_search_options, ...requestWithoutSearchOptions } = requestData;
    const model = c.var.model;
    if (!model) return { requestData: requestWithoutSearchOptions };
    const supported = model.definition.searchContextSizes;
    if (!supported?.length) {
        return { requestData: requestWithoutSearchOptions };
    }

    const requested = web_search_options?.search_context_size;
    if (
        supported.length > 1 &&
        requested !== undefined &&
        !supported.includes(requested as "low" | "high")
    ) {
        return {
            errorResponse: c.json(
                {
                    error: {
                        message: `Unsupported web_search_options.search_context_size. Use ${supported.map((size) => `"${size}"`).join(" or ")}.`,
                    },
                },
                400,
            ),
        };
    }

    if (supported.length > 1 && requested === undefined) {
        return { requestData: requestWithoutSearchOptions };
    }

    const searchContextSize =
        supported.length > 1 && requested
            ? (requested as "low" | "high")
            : supported[0];
    c.var.track.setPricingInput({ searchContextSize });
    return {
        requestData: {
            ...requestWithoutSearchOptions,
            web_search_options: { search_context_size: searchContextSize },
        },
    };
}

export async function handleChatCompletionLocal(
    c: TextContext,
    body: Record<string, unknown>,
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, "/openai");
    const requestData = getRequestData(req);
    return generateTextResponse(c, requestData, false);
}

export async function handleCreateResponseLocal(
    c: TextContext,
    body: CreateResponseRequest & Record<string, unknown>,
    chatRequest = responseRequestToChatRequest(body),
): Promise<Response> {
    try {
        const agentId = (
            c.var.model?.communityEndpoint as
                | ({ agentId?: unknown } & Record<string, unknown>)
                | undefined
        )?.agentId;
        if (agentId && body.tools?.length) {
            const error = new Error(
                "tools: managed prompt agents use only their configured MCP tools",
            ) as ServiceError;
            error.status = 400;
            error.code = "unsupported_parameter";
            (error as ServiceError & { param: string }).param = "tools";
            error.details = {
                error: {
                    type: "invalid_request_error",
                    code: "unsupported_parameter",
                    param: "tools",
                    message:
                        "Managed prompt agents do not accept request-supplied tools",
                },
            };
            throw error;
        }
        const chatResponse = await handleChatCompletionLocal(c, chatRequest);
        if (body.stream === true) {
            // Tracking and billing understand the canonical Chat stream. Keep
            // one clone for them while adapting the client-facing stream.
            c.var.track?.overrideResponseTracking(chatResponse.clone());
            return responsesStreamResponse(chatResponse, body);
        }

        const responseText = await chatResponse.text();
        let completion: ChatCompletion;
        try {
            completion = CreateChatCompletionResponseSchema.parse(
                JSON.parse(responseText),
                { reportInput: true },
            );
        } catch (error) {
            const invalidResponse = new Error(
                `Upstream returned invalid Chat Completions JSON: ${error instanceof Error ? error.message : String(error)}`,
            ) as ServiceError;
            invalidResponse.status = 502;
            invalidResponse.upstreamStatus = chatResponse.status;
            invalidResponse.details = responseText;
            throw invalidResponse;
        }
        const headers = new Headers(chatResponse.headers);
        headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(
            JSON.stringify(chatCompletionToResponse(completion, body)),
            { status: chatResponse.status, headers },
        );
    } catch (thrown: unknown) {
        if ((thrown as ServiceError).status === 400) {
            return responsesErrorResponse(thrown);
        }
        throwTextError(thrown as ServiceError);
    }
}

export async function handleTextContentLocal(
    c: TextContext,
    body: Record<string, unknown>,
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, c.req.path);
    const requestData = prepareRequestParameters(
        getRequestData(req),
        c.var.model.definition,
    );
    return generateTextResponse(c, requestData, true);
}

export async function handleSimpleTextLocal(
    c: TextContext,
    prompt: string,
    model: string,
    body: Record<string, unknown> = {},
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, c.req.path, {
        ...c.req.param(),
        0: prompt,
    });
    const requestData = prepareRequestParameters(
        {
            ...getRequestData(req),
            model,
        },
        c.var.model.definition,
    );
    return generateTextResponse(c, requestData, true);
}
