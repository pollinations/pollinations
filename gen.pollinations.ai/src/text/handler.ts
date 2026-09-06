import { UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    hasExplicitPromptCacheHit,
    MODEL_USED_HEADER,
    openaiUsageToUsage,
    PROMPT_CACHE_TYPE_HEADER,
} from "@shared/registry/usage-headers.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import {
    attachFallbackTarget,
    type FallbackCandidate,
    fallbackCandidates,
    withModelFallback,
} from "../fallback.ts";
import { fixWavHeader } from "../routes/audio.js";
import type { GenerateTextRequestQueryParams } from "../schemas/text.ts";
import { enforceModelRateLimit } from "../utils/model-rate-limit.ts";
import { createPromptAgentResponsesClient } from "./agents/client.ts";
import {
    requireChatCompletionUsage,
    requireChatStreamUsage,
} from "./chat/usage.js";
import { communityEndpointGatewayContext } from "./communityEndpoint.ts";
import { syncTextEnvironment } from "./environment.js";
import { throwTextError } from "./errors.js";
import { supportsTextFallbackRequest } from "./fallbackCompatibility.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import {
    getChatRequestData,
    getSimpleTextRequestData,
} from "./requestUtils.js";
import type {
    ChatCompletion,
    RequestData,
    ServiceError,
    TransformOptions,
} from "./types.js";

type TextContext = Context<Env>;

function generatePollinationsId(): string {
    return `pllns_${crypto.randomUUID().replaceAll("-", "")}`;
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
async function gatewayContext(
    c: TextContext,
    requestData: RequestData,
    candidate: FallbackCandidate,
): Promise<TransformOptions> {
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
    const context = await communityEndpointGatewayContext({
        endpoint: communityEndpoint,
        modelDefinition: definition,
        requestData: candidateRequest,
        secret: c.env.BETTER_AUTH_SECRET,
        portkeyGatewayUrl: c.env.PORTKEY_GATEWAY_URL,
        userApiKey: c.var.auth?.apiKey?.rawKey || "",
        parentRequestId: c.get("requestId"),
        parentApiKeyId: c.var.auth?.apiKey?.id,
    });
    if (communityEndpoint.type !== "prompt_agent") return context;

    const apiKey = context.modelConfig?.authKey;
    if (typeof apiKey !== "string" || !apiKey) {
        throw new Error("Managed agent request has no agent run token");
    }
    const client = await createPromptAgentResponsesClient(
        c,
        communityEndpoint,
        apiKey,
    );
    return {
        ...context,
        responsesFetcher: client.fetcher,
        modelConfig: {
            ...context.modelConfig,
            responsesEndpoint: client.target.endpoint,
        },
    };
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
        if (hasExplicitPromptCacheHit(usage)) {
            headers.set(PROMPT_CACHE_TYPE_HEADER, "ephemeral");
        }
    }
    if (completion?.fallbackTarget) {
        headers.set(FALLBACK_TARGET_HEADER, completion.fallbackTarget);
    }
    return headers;
}

function publicCompletionUsage(
    usage: ChatCompletion["usage"],
): ChatCompletion["usage"] {
    if (!usage || (!("cost" in usage) && !("search_context_size" in usage))) {
        return usage;
    }

    const {
        cost: _cost,
        search_context_size: _searchContextSize,
        ...publicUsage
    } = usage;
    return publicUsage;
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
            created: completion.created || Math.floor(Date.now() / 1000),
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

    if (!completion.responseStream) {
        throw new UpstreamError(502, {
            message: "Text model returned an empty stream",
            requestUrl: completion.upstreamRequestUrl,
        });
    }
    return new Response(completion.responseStream, { headers });
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
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
        const candidates = fallbackCandidates(c.var.model)
            .map((candidate, originalIndex) => ({
                ...candidate,
                originalIndex,
            }))
            .filter(
                (candidate) =>
                    candidate.originalIndex === 0 ||
                    supportsTextFallbackRequest(
                        candidate.definition,
                        normalizedRequestData,
                    ),
            );
        const { result: completion, candidate } = await withModelFallback(
            candidates,
            async (attempt) => {
                const result = await generateTextPortkey(
                    normalizedRequestData.messages,
                    await gatewayContext(c, normalizedRequestData, attempt),
                    portkey
                        ? (input, init) => portkey.fetch(input, init)
                        : undefined,
                );
                if (!normalizedRequestData.stream) {
                    requireChatCompletionUsage(result);
                }
                return result;
            },
            c.var.track?.attempts,
            (attempt) => enforceModelRateLimit(c, attempt),
        );
        c.set("upstreamRequestUrl", completion.upstreamRequestUrl);
        completion.id = completion.id || generatePollinationsId();
        // Keep the internal "config.targets[N]" marker stable for response
        // headers and cached tracking data. Non-enumerable so JSON.stringify /
        // R2 cache snapshots never leak the field.
        attachFallbackTarget(completion, candidate.originalIndex);

        // The successful candidate always carries the canonical registry id,
        // including aliases, community models, and fallback targets.
        const servedModelId = candidate.id || undefined;
        if (normalizedRequestData.stream) {
            if (!completion.responseStream) {
                return sendTextStreamResponse(completion, servedModelId);
            }
            // Client and billing must see the same validation errors.
            const [clientBody, trackingBody] = requireChatStreamUsage(
                completion.responseStream,
            ).tee();
            completion.responseStream = clientBody;
            const response = sendTextStreamResponse(completion, servedModelId);
            c.var.track?.overrideResponseTracking(
                new Response(trackingBody, { headers: response.headers }),
            );
            return response;
        }
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
    body: CreateChatCompletionRequest,
): Promise<Response> {
    return generateTextResponse(c, getChatRequestData(body), false);
}

export async function handleTextContentLocal(
    c: TextContext,
    body: CreateChatCompletionRequest,
): Promise<Response> {
    const requestData = prepareRequestParameters(
        getChatRequestData(body),
        c.var.model.definition,
    );
    return generateTextResponse(c, requestData, true);
}

export async function handleSimpleTextLocal(
    c: TextContext,
    prompt: string,
    model: string,
    query: GenerateTextRequestQueryParams,
): Promise<Response> {
    const requestData = prepareRequestParameters(
        getSimpleTextRequestData(prompt, model, query),
        c.var.model.definition,
    );
    return generateTextResponse(c, requestData, true);
}
