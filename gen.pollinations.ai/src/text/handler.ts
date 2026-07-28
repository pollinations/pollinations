import { UpstreamError } from "@shared/error.ts";
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
import type { GenerationModelEntry } from "../model-registry.ts";
import { fixWavHeader } from "../routes/audio.js";
import { findModelByName } from "./availableModels.js";
import {
    communityEndpointGatewayContext,
    communityEndpointPortkeyTarget,
} from "./communityEndpoint.ts";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { type ExpressLikeRequest, getRequestData } from "./requestUtils.js";
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

// Statuses that make Portkey move on to the fallback target. 400 and 422 are
// left out on purpose: those are caller errors and replaying them cannot
// succeed. 401/402/403/404 are included because they mean the primary's
// credentials or upstream model are broken, which the fallback may survive.
const FALLBACK_ON_STATUS_CODES = [
    401, 402, 403, 404, 408, 429, 500, 502, 503, 504,
];

type PortkeyTarget = Record<string, unknown>;

// Provider config keys with a safe Portkey target form. Anything else (Azure /
// Bedrock / Vertex credential sets, `useUserApiKey` passthrough, per-model
// `defaultOptions`) is not converted: those models simply run without a
// fallback instead of being sent as a silently broken target config.
const CONVERTIBLE_CONFIG_KEYS = new Set([
    "provider",
    "custom-host",
    "authKey",
    "model",
]);

function providerConfigToTarget(
    config: Record<string, unknown> | undefined,
): PortkeyTarget | null {
    if (!config) return null;
    if (Object.keys(config).some((key) => !CONVERTIBLE_CONFIG_KEYS.has(key))) {
        return null;
    }
    const { provider, model, authKey } = config;
    const customHost = config["custom-host"];
    if (typeof provider !== "string" || typeof model !== "string") return null;
    return {
        provider,
        ...(customHost ? { custom_host: customHost } : {}),
        ...(authKey ? { authKey } : {}),
        override_params: { model },
    };
}

function staticModelConfig(
    modelId: string,
): Record<string, unknown> | undefined {
    const rawConfig = findModelByName(modelId)?.config;
    if (!rawConfig) return undefined;
    return (
        typeof rawConfig === "function" ? rawConfig() : rawConfig
    ) as Record<string, unknown>;
}

async function portkeyTargetForEntry(
    entry: GenerationModelEntry,
    secret: string,
): Promise<PortkeyTarget | null> {
    if (entry.communityEndpoint) {
        return communityEndpointPortkeyTarget(entry.communityEndpoint, secret);
    }
    return providerConfigToTarget(staticModelConfig(entry.id));
}

// Two-target Portkey fallback config. Returns null when either side has no
// convertible provider config, in which case the request runs against the
// primary alone.
async function buildFallbackModelConfig(
    primaryConfig: Record<string, unknown> | undefined,
    fallbackEntry: GenerationModelEntry,
    secret: string,
): Promise<Record<string, unknown> | null> {
    const primaryTarget = providerConfigToTarget(primaryConfig);
    const fallbackTarget = await portkeyTargetForEntry(fallbackEntry, secret);
    if (!primaryTarget || !fallbackTarget) return null;
    return {
        // resolveModelConfig() derives the request-body model from
        // config.model (utils/modelResolver.ts); a strategy/targets config has
        // none at provider level, so it must be set explicitly. Each target
        // overrides it anyway through override_params.
        model: (primaryTarget.override_params as { model: string }).model,
        strategy: {
            mode: "fallback",
            on_status_codes: FALLBACK_ON_STATUS_CODES,
        },
        targets: [primaryTarget, fallbackTarget],
    };
}

// Portkey reports the served target as "config.targets[N]". Index 1 is the
// single fallback target; a missing or unparseable value means the primary
// served. Read before the stream is returned, so this works for streaming too.
function servedFallbackEntry(
    fallbackTarget: string | undefined,
    fallbackEntry: GenerationModelEntry | undefined,
): GenerationModelEntry | undefined {
    if (!fallbackEntry || !fallbackTarget) return undefined;
    const index = fallbackTarget.match(/\[(\d+)\]/)?.[1];
    return index !== undefined && Number(index) === 1
        ? fallbackEntry
        : undefined;
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
    if (modelUsed) {
        const usage = completion?.usage
            ? openaiUsageToUsage(
                  completion.usage as unknown as Parameters<
                      typeof openaiUsageToUsage
                  >[0],
              )
            : {};
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
    fallbackModel: string | undefined,
    upstreamRequestUrl: URL | undefined,
): Response {
    const headers = usageHeaders(completion, fallbackModel);
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

function throwTextError(error: ServiceError): never {
    const status =
        typeof error.status === "number"
            ? error.status
            : typeof error.code === "number"
              ? error.code
              : 500;

    throw new UpstreamError(status as ContentfulStatusCode, {
        message: error.message || "Text generation failed",
        requestUrl: error.requestUrl,
        upstreamStatus: error.upstreamStatus,
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
        const communityEndpoint = c.var.model?.communityEndpoint;
        const gatewayContext: TransformOptions = communityEndpoint
            ? await communityEndpointGatewayContext(
                  communityEndpoint,
                  c.var.model.definition,
                  requestData,
                  c.env.BETTER_AUTH_SECRET,
                  c.env.PORTKEY_GATEWAY_URL,
                  c.var.auth?.apiKey?.rawKey || "",
                  c.var.auth?.apiKey?.id,
              )
            : withGatewayContext(c, requestData);
        const declaredFallbackEntry = c.var.model?.fallbackEntry;
        const fallbackConfig = declaredFallbackEntry
            ? await buildFallbackModelConfig(
                  gatewayContext.modelConfig ??
                      staticModelConfig(c.var.model.resolved),
                  declaredFallbackEntry,
                  c.env.BETTER_AUTH_SECRET,
              )
            : null;
        const completion = await generateTextPortkey(
            requestData.messages,
            fallbackConfig
                ? { ...gatewayContext, modelConfig: fallbackConfig }
                : gatewayContext,
        );
        c.set("upstreamRequestUrl", completion.upstreamRequestUrl);
        completion.id = completion.id || generatePollinationsId();

        // Billing follows what actually served, so record the serving entry
        // before the response (streaming included) leaves the handler.
        const servedEntry = servedFallbackEntry(
            completion.fallbackTarget,
            fallbackConfig ? declaredFallbackEntry : undefined,
        );
        if (servedEntry) c.set("servedModelEntry", servedEntry);

        if (requestData.stream) return sendTextStreamResponse(completion);
        const fallbackModel = servedEntry?.id ?? c.var.model?.resolved;
        // Provider-reported cost is read post-response in track (clamp-and-alert
        // in the registry) — malformed/absent cost never fails the request.
        const trackingResponse = sendOpenAIResponse(completion, fallbackModel);
        const publicCompletion = publicChatCompletion(completion);
        if (contentResponse) {
            c.var.track?.overrideResponseTracking(trackingResponse.clone());
            return sendTextContentResponse(
                publicCompletion,
                fallbackModel,
                c.var.upstreamRequestUrl,
            );
        }
        c.var.track?.overrideResponseTracking(trackingResponse.clone());
        return sendOpenAIResponse(publicCompletion, fallbackModel);
    } catch (thrown: unknown) {
        throwTextError(thrown as ServiceError);
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
