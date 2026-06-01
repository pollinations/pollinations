import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import {
    getModelDefinition,
    type ModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { remapUpstreamStatus, UpstreamError } from "@/error.ts";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { type ExpressLikeRequest, getRequestData } from "./requestUtils.js";
import type { ChatCompletion, RequestData, ServiceError } from "./types.js";

type TextContext = Context<Env>;

const TEXT_ENV_KEYS = [
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_MYCELI_PROD_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "DEEPINFRA_API_KEY",
    "FIREWORKS_API_KEY",
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

function getRequestModelDefinition(
    requestParams: RequestData,
): ModelDefinition | undefined {
    try {
        return getModelDefinition(requestParams.model as ModelName);
    } catch {
        return undefined;
    }
}

function stripUnsupportedReasoningEffort(
    requestParams: RequestData,
    serviceDef = getRequestModelDefinition(requestParams),
): RequestData {
    // Drop reasoning_effort for models that don't support reasoning. Some
    // upstreams (e.g. the non-reasoning Grok deployment) return an opaque 500
    // instead of ignoring the unsupported param.
    if (
        serviceDef?.reasoning === true ||
        requestParams.reasoning_effort === undefined
    ) {
        return requestParams;
    }

    const { reasoning_effort: _dropped, ...rest } = requestParams;
    return rest;
}

export function prepareRequestParameters(
    requestParams: RequestData,
): RequestData {
    const serviceDef = getRequestModelDefinition(requestParams);
    const params = stripUnsupportedReasoningEffort(requestParams, serviceDef);
    const isAudioModel =
        serviceDef?.outputModalities?.includes("audio") ?? false;

    if (!isAudioModel) return params;

    const voice = params.voice || params.audio?.voice || "amuch";
    const audioFormat = params.stream ? "pcm16" : "mp3";

    return {
        ...params,
        modalities: params.modalities || ["text", "audio"],
        audio: params.audio
            ? {
                  ...params.audio,
                  format: params.audio.format || audioFormat,
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

function usageHeaders(completion: ChatCompletion): Headers {
    const headers = new Headers();
    if (completion?.usage && completion?.model) {
        const usage = openaiUsageToUsage(
            completion.usage as unknown as Parameters<
                typeof openaiUsageToUsage
            >[0],
        );
        for (const [key, value] of Object.entries(
            buildUsageHeaders(completion.model, usage),
        )) {
            headers.set(key, String(value));
        }
    }
    return headers;
}

function sendOpenAIResponse(completion: ChatCompletion): Response {
    const headers = usageHeaders(completion);
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

function sendTextContentResponse(completion: ChatCompletion): Response {
    const headers = usageHeaders(completion);
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
        headers.set("Content-Type", "audio/mpeg");
        return new Response(base64ToArrayBuffer(audio.data), { headers });
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
        const completion = await generateTextPortkey(
            requestData.messages,
            withGatewayContext(c, requestData),
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
        if (contentResponse) return sendTextContentResponse(completion);
        return sendOpenAIResponse(completion);
    } catch (thrown: unknown) {
        throwTextError(thrown as ServiceError, c);
    }
}

export async function handleChatCompletionLocal(
    c: TextContext,
    body: Record<string, unknown>,
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, "/openai");
    const requestData = stripUnsupportedReasoningEffort(getRequestData(req));
    return generateTextResponse(c, requestData, false);
}

export async function handleTextContentLocal(
    c: TextContext,
    body: Record<string, unknown>,
): Promise<Response> {
    const req = createExpressLikeRequest(c, body, c.req.path);
    const requestData = prepareRequestParameters(getRequestData(req));
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
    const requestData = prepareRequestParameters({
        ...getRequestData(req),
        model,
    });
    return generateTextResponse(c, requestData, true);
}
