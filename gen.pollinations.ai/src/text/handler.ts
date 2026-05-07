import { R2_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import {
    getModelDefinition,
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

function prepareRequestParameters(requestParams: RequestData): RequestData {
    let isAudioModel = false;
    try {
        const serviceDef = getModelDefinition(requestParams.model as ModelName);
        isAudioModel = serviceDef?.outputModalities?.includes("audio") ?? false;
    } catch {
        // Model not in registry.
    }

    if (!isAudioModel) return requestParams;

    const voice = requestParams.voice || requestParams.audio?.voice || "amuch";
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
        userInfo: {
            userId: c.var.auth?.user?.id,
            username: c.var.auth?.user?.githubUsername,
            tier: c.var.auth?.user?.tier,
            referrer: requestData.referrer || "unknown",
            cf_ray: c.req.header("cf-ray") || "",
        },
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
    headers.set("Cache-Control", R2_CACHE_CONTROL);

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

    if (message.content) {
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

    return new Response(asyncIterableToStream(completion.responseStream), {
        headers,
    });
}

function asyncIterableToStream(
    iterable: AsyncIterable<unknown> | null | undefined,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            if (!iterable) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ choices: [{ delta: { content: "Streaming response could not be processed." }, finish_reason: "stop", index: 0 }] })}\n\n`,
                    ),
                );
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
            }

            try {
                for await (const chunk of iterable) {
                    if (typeof chunk === "string") {
                        controller.enqueue(encoder.encode(chunk));
                    } else if (chunk instanceof Uint8Array) {
                        controller.enqueue(chunk);
                    } else {
                        controller.enqueue(encoder.encode(String(chunk)));
                    }
                }
            } catch (thrown) {
                const message =
                    thrown instanceof Error
                        ? thrown.message
                        : "Streaming response failed";
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ error: { message } })}\n\n`,
                    ),
                );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
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
    const mappedStatus =
        error.name === "ModelResolutionError" || status === 429
            ? status
            : remapUpstreamStatus(status);

    throw new UpstreamError(mappedStatus as ContentfulStatusCode, {
        message: error.message || "Text generation failed",
        requestUrl: new URL(c.req.url),
        upstreamStatus: status,
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
            error.status = errorObj.status;
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
    const requestData = getRequestData(req);
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
