import { groupMemberFallbackOrder } from "@shared/community-endpoints.ts";
import { remapUpstreamStatus, UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { fixWavHeader } from "../routes/audio.js";
import { communityEndpointGatewayContext } from "./communityEndpoint.ts";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { type ExpressLikeRequest, getRequestData } from "./requestUtils.js";
import type { ChatCompletion, RequestData, ServiceError } from "./types.js";

type TextContext = Context<Env>;

const TEXT_ENV_KEYS = [
    "AI_GATEWAY_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_MYCELI_PROD_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "FIREWORKS_NEO_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "INCEPTION_API_KEY",
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
    modelDefinition: ModelDefinition<string>,
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

function withGatewayContext(c: TextContext, requestData: RequestData) {
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;

    return {
        ...requestDataWithoutMessages,
        userApiKey: c.var.auth?.apiKey?.rawKey || "",
        portkeyGatewayUrl: c.env.PORTKEY_GATEWAY_URL,
    };
}

function usageHeaders(
    completion: ChatCompletion,
    fallbackModel?: string,
): Headers {
    const headers = new Headers();
    const modelUsed = completion?.model || fallbackModel;
    if (completion?.usage && modelUsed) {
        const usage = openaiUsageToUsage(
            completion.usage as unknown as Parameters<
                typeof openaiUsageToUsage
            >[0],
        );
        for (const [key, value] of Object.entries(
            buildUsageHeaders(modelUsed, usage),
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

    return {
        ...completion,
        usage,
    };
}

function sendOpenAIResponse(
    completion: ChatCompletion,
    fallbackModel?: string,
): Response {
    const headers = usageHeaders(completion, fallbackModel);
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
    fallbackModel?: string,
): Response {
    const headers = usageHeaders(completion, fallbackModel);
    headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);

    if (!completion.choices?.[0]) {
        throw new UpstreamError(502, {
            message: "Unrecognized response format from text model",
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

function sendTextStreamResponse(completion: ChatCompletion): Response {
    const headers = new Headers({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    // sendTextStreamResponse bypasses usageHeaders(), so set the fallback
    // header here too — tracking reads it off the worker response for streams.
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

function throwTextError(error: ServiceError, c: TextContext): never {
    const status =
        typeof error.status === "number"
            ? error.status
            : typeof error.code === "number"
              ? error.code
              : 500;
    const upstreamStatus =
        typeof error.upstreamStatus === "number"
            ? error.upstreamStatus
            : status;

    throw new UpstreamError(status as ContentfulStatusCode, {
        message: error.message || "Text generation failed",
        requestUrl: new URL(c.req.url),
        upstreamStatus,
        responseBody: serializeDetails(error.details || error.response?.data),
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
        const group = c.var.model?.group;
        const communityEndpoint = c.var.model?.communityEndpoint;

        // Group routing: try each active member in round-robin order,
        // falling back on pre-stream failure (non-streamed v1 only).
        if (group && group.members.length > 0 && !requestData.stream) {
            const members = groupMemberFallbackOrder(group);
            let lastError: unknown;

            for (const member of members) {
                try {
                    const gatewayContext =
                        await communityEndpointGatewayContext(
                            member,
                            c.var.model.definition,
                            requestData,
                            c.env.BETTER_AUTH_SECRET,
                            c.env.PORTKEY_GATEWAY_URL,
                            c.var.auth?.apiKey?.rawKey || "",
                        );
                    const completion = await generateTextPortkey(
                        requestData.messages,
                        gatewayContext,
                    );
                    completion.id = completion.id || generatePollinationsId();

                    if (completion.error) {
                        const errorObj =
                            typeof completion.error === "string"
                                ? { message: completion.error }
                                : completion.error;
                        const error = new Error(
                            errorObj.message || "Text generation failed",
                        ) as ServiceError;
                        if (typeof errorObj.status === "number") {
                            error.status = remapUpstreamStatus(errorObj.status);
                            error.upstreamStatus = errorObj.status;
                        }
                        error.details = errorObj.details;
                        // Only retry on server errors (5xx); client errors
                        // (4xx) are likely model-level, not member-level.
                        if (
                            error.status &&
                            error.status >= 500 &&
                            error.status < 600
                        ) {
                            lastError = error;
                            continue;
                        }
                        throw error;
                    }

                    const fallbackModel = c.var.model?.resolved;
                    const trackingResponse = sendOpenAIResponse(
                        completion,
                        fallbackModel,
                    );
                    const publicCompletion = publicChatCompletion(completion);
                    if (contentResponse) {
                        c.var.track?.overrideResponseTracking(
                            trackingResponse.clone(),
                        );
                        return sendTextContentResponse(
                            publicCompletion,
                            fallbackModel,
                        );
                    }
                    c.var.track?.overrideResponseTracking(
                        trackingResponse.clone(),
                    );
                    return sendOpenAIResponse(publicCompletion, fallbackModel);
                } catch (thrown: unknown) {
                    // Connection errors are retryable; other errors propagate.
                    if (
                        thrown instanceof Error &&
                        (thrown.name === "TypeError" ||
                            thrown.message?.includes("fetch"))
                    ) {
                        lastError = thrown;
                        continue;
                    }
                    throw thrown;
                }
            }

            // All members failed — throw the last error.
            if (lastError) throw lastError;
        }

        // Standard single-endpoint path (static models or standalone community).
        // For group models in streaming mode, select a member via round-robin
        // but don't fall back (v1 scope — mid-stream fallback deferred).
        const endpointForMember =
            group && group.members.length > 0
                ? groupMemberFallbackOrder(group)[0]
                : communityEndpoint;
        const gatewayContext = endpointForMember
            ? await communityEndpointGatewayContext(
                  communityEndpoint,
                  c.var.model.definition,
                  requestData,
                  c.env.BETTER_AUTH_SECRET,
                  c.env.PORTKEY_GATEWAY_URL,
                  c.var.auth?.apiKey?.rawKey || "",
              )
            : withGatewayContext(c, requestData);
        const completion = await generateTextPortkey(
            requestData.messages,
            gatewayContext,
        );
        completion.id = completion.id || generatePollinationsId();

        if (completion.error) {
            const errorObj =
                typeof completion.error === "string"
                    ? { message: completion.error }
                    : completion.error;
            const error = new Error(
                errorObj.message || "Text generation failed",
            ) as ServiceError;
            if (typeof errorObj.status === "number") {
                error.status = remapUpstreamStatus(errorObj.status);
                error.upstreamStatus = errorObj.status;
            }
            error.details = errorObj.details;
            throw error;
        }

        if (requestData.stream) return sendTextStreamResponse(completion);
        const fallbackModel = c.var.model?.resolved;
        // Provider-reported cost is read post-response in track (clamp-and-alert
        // in the registry) — malformed/absent cost never fails the request.
        const trackingResponse = sendOpenAIResponse(completion, fallbackModel);
        const publicCompletion = publicChatCompletion(completion);
        if (contentResponse) {
            c.var.track?.overrideResponseTracking(trackingResponse.clone());
            return sendTextContentResponse(publicCompletion, fallbackModel);
        }
        c.var.track?.overrideResponseTracking(trackingResponse.clone());
        return sendOpenAIResponse(publicCompletion, fallbackModel);
    } catch (thrown: unknown) {
        throwTextError(thrown as ServiceError, c);
    }
}

export async function handleChatCompletionLocal(
    c: TextContext,
    body: Record<string, unknown>,
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, "/openai");
    const requestData = getRequestData(req);
    return generateTextResponse(c, requestData, false);
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
