import { collectUpstreamHeaders, remapUpstreamStatus } from "@shared/error.ts";
import debug from "debug";
import {
    CONTENT_POLICY_STATUS,
    isContentPolicyViolation,
} from "../image/utils/contentModeration.ts";
import { prepareMessages } from "./textGenerationUtils.js";
import type {
    ChatCompletion,
    ChatMessage,
    CompletionChoice,
    OpenAIClientConfig,
    ServiceError,
    TransformOptions,
} from "./types.js";
import { cleanNullAndUndefined } from "./utils/objectCleaners.js";

const log = debug("pollinations:genericopenai");
const errorLog = debug("pollinations:error");
const DONE_EVENT_PATTERN = /data:\s*\[DONE\]/;

function isClientInputError(details: unknown): boolean {
    const serialized =
        typeof details === "string" ? details : JSON.stringify(details);
    return /no endpoints found that support (?:image|audio|video) input|multimodal processing failed|(?:image|audio) decode error|invalid or unsupported audio file|failed to load image|cannot identify image file|image URL must be a valid and downloadable URL or look like data:/i.test(
        serialized,
    );
}

function apiErrorStatus(details: unknown, status: number): number {
    if (isContentPolicyViolation(JSON.stringify(details))) {
        return CONTENT_POLICY_STATUS;
    }
    return isClientInputError(details) ? 400 : remapUpstreamStatus(status);
}

// Attach internal response metadata as non-enumerable properties so downstream
// handling can use it without adding fields to OpenAI-compatible response bodies.
function withUpstreamRequestUrl(
    completion: ChatCompletion,
    requestUrl: URL,
): ChatCompletion {
    Object.defineProperty(completion, "upstreamRequestUrl", {
        value: requestUrl,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return completion;
}

function ensureOpenAISseDone(
    source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let seenDone = false;
    let tail = "";

    return source.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                const text = decoder.decode(chunk, { stream: true });
                const check = `${tail}${text}`;
                if (DONE_EVENT_PATTERN.test(check)) seenDone = true;
                tail = check.slice(-64);
                controller.enqueue(chunk);
            },
            flush(controller) {
                const finalText = decoder.decode();
                if (finalText) {
                    const check = `${tail}${finalText}`;
                    if (DONE_EVENT_PATTERN.test(check)) seenDone = true;
                    controller.enqueue(encoder.encode(finalText));
                }
                if (!seenDone) {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                }
            },
        }),
    );
}

function extractErrorMessage(details: unknown): string | null {
    if (typeof details === "string") return details.trim() || null;
    if (!details || typeof details !== "object") return null;

    const error = (details as { error?: unknown }).error;
    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
            return message;
        }
    }

    const message = (details as { message?: unknown }).message;
    return typeof message === "string" && message.trim() ? message : null;
}

/**
 * Some OpenAI-compatible gateways return an upstream rate limit inside an
 * otherwise successful completion. Normalize explicit rate limits and policy
 * rejections; other finish errors (e.g. malformed tool output) stay unchanged.
 */
function responseBodyError(
    completion: ChatCompletion,
): ChatCompletion["error"] {
    if (completion.error) return completion.error;

    for (const choice of completion.choices ?? []) {
        if (choice.finish_reason !== "error") continue;
        const details = choice.error;
        if (!details || typeof details !== "object") continue;
        const embedded = details as { code?: unknown; status?: unknown };
        if (
            embedded.code !== 429 &&
            embedded.status !== 429 &&
            !isContentPolicyViolation(JSON.stringify(details))
        )
            continue;

        return {
            message: extractErrorMessage(details) ?? undefined,
            status:
                typeof embedded.status === "number"
                    ? embedded.status
                    : typeof embedded.code === "number"
                      ? embedded.code
                      : undefined,
            details,
        };
    }
}

function createApiError(
    response: Response,
    responseBody: string,
    details: unknown,
    modelName: string,
    requestUrl: URL,
): ServiceError {
    const statusMessage = `${response.status} ${response.statusText}`;
    const detailMessage = extractErrorMessage(details);
    const error = new Error(
        detailMessage ? `${statusMessage}: ${detailMessage}` : statusMessage,
    ) as ServiceError;
    error.status = apiErrorStatus(details, response.status);
    error.upstreamStatus = response.status;
    error.details = details;
    error.responseBody = responseBody;
    error.model = modelName;
    error.requestUrl = requestUrl;
    error.upstreamHeaders = collectUpstreamHeaders(response.headers);
    return error;
}

function parseJsonSafe(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function toServiceError(thrown: unknown): ServiceError {
    return thrown instanceof Error
        ? (thrown as ServiceError)
        : (new Error(String(thrown), { cause: thrown }) as ServiceError);
}

function withUpstreamContext(thrown: unknown, requestUrl: URL): ServiceError {
    const error = toServiceError(thrown);
    error.requestUrl ??= requestUrl;
    error.status ??= 502;
    return error;
}

export async function genericOpenAIClient(
    messages: ChatMessage[],
    options: TransformOptions = {},
    config: OpenAIClientConfig,
): Promise<ChatCompletion> {
    const { endpoint, additionalHeaders = {}, fetcher = fetch } = config;
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    let requestUrl: URL | undefined;

    log(`[${requestId}] Starting request`, {
        messageCount: messages?.length || 0,
        model: options.model,
        requestedModel: options.requestedModel,
        stream: options.stream === true,
        optionKeys: Object.keys(options),
    });

    let modelName = "unknown";

    try {
        if (!options.model) {
            throw new Error("Model is required");
        }
        modelName = options.model;

        const preparedMessages = prepareMessages(messages);
        const {
            additionalHeaders: _additionalHeaders,
            jsonMode: _jsonMode,
            modelConfig: _modelConfig,
            modelDef: _modelDef,
            normalizeFinishReasonAtTokenLimit:
                _normalizeFinishReasonAtTokenLimit,
            portkeyGatewayUrl: _portkeyGatewayUrl,
            requestedModel: _requestedModel,
            userApiKey: _userApiKey,
            ...cleanedOptions
        } = options;
        const requestBody = cleanNullAndUndefined({
            model: modelName,
            messages: preparedMessages,
            ...cleanedOptions,
        });

        log(`[${requestId}] Request body prepared`, {
            model: modelName,
            messageCount: preparedMessages.length,
            optionKeys: Object.keys(cleanedOptions),
            stream: options.stream === true,
        });

        const endpointUrl =
            typeof endpoint === "function"
                ? endpoint(modelName, options)
                : endpoint;
        requestUrl = new URL(endpointUrl);

        const headers = {
            "Content-Type": "application/json",
            ...additionalHeaders,
        };

        log(`[${requestId}] Header keys:`, Object.keys(headers));

        let response: Response;
        try {
            response = await fetcher(endpointUrl, {
                method: "POST",
                redirect: "manual",
                headers,
                body: JSON.stringify(requestBody),
            });
        } catch (thrown: unknown) {
            throw withUpstreamContext(thrown, requestUrl);
        }

        if (!response.ok) {
            let errorText: string;
            try {
                errorText = await response.text();
            } catch (thrown: unknown) {
                throw withUpstreamContext(thrown, requestUrl);
            }
            const errorDetails = parseJsonSafe(errorText) || errorText;
            errorLog(
                `[${requestId}] API error (${response.status}):`,
                errorDetails,
            );
            throw createApiError(
                response,
                errorText,
                errorDetails,
                modelName,
                requestUrl,
            );
        }

        if (options.stream) {
            log(
                `[${requestId}] Streaming response, status: ${response.status}`,
            );

            if (!response.body) {
                throw withUpstreamContext(
                    new Error("Text model returned an empty stream"),
                    requestUrl,
                );
            }
            const streamToReturn = ensureOpenAISseDone(response.body);
            return withUpstreamRequestUrl(
                {
                    id: `genericopenai-${requestId}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(startTime / 1000),
                    model: modelName,
                    stream: true,
                    responseStream: streamToReturn,
                    choices: [
                        {
                            delta: { content: "" },
                            finish_reason: null,
                            index: 0,
                        },
                    ],
                },
                requestUrl,
            );
        }

        let data: ChatCompletion;
        let responseBody: string | undefined;
        try {
            responseBody = await response.text();
            data = JSON.parse(responseBody) as ChatCompletion;
        } catch (thrown: unknown) {
            const error = withUpstreamContext(thrown, requestUrl);
            error.responseBody = responseBody;
            error.upstreamStatus = response.status;
            error.upstreamHeaders = collectUpstreamHeaders(response.headers);
            throw error;
        }
        const responseError = responseBodyError(data);
        if (responseError) {
            const errorDetails =
                typeof responseError === "string"
                    ? { message: responseError }
                    : responseError;
            const error = new Error(
                errorDetails.message || "Text generation failed",
            ) as ServiceError;
            const upstreamStatus =
                typeof errorDetails.status === "number"
                    ? errorDetails.status
                    : typeof errorDetails.code === "number" &&
                        errorDetails.code >= 400 &&
                        errorDetails.code <= 599
                      ? errorDetails.code
                      : undefined;
            error.status = apiErrorStatus(errorDetails, upstreamStatus ?? 502);
            error.upstreamStatus = upstreamStatus;
            error.details = errorDetails.details ?? errorDetails;
            error.responseBody = responseBody;
            error.model = modelName;
            error.requestUrl = requestUrl;
            error.upstreamHeaders = collectUpstreamHeaders(response.headers);
            throw error;
        }
        log(
            `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
        );

        const choices = (data.choices?.length ? data.choices : [{}]).map(
            (choice): CompletionChoice => {
                const formattedChoice = { ...choice };
                // Some providers report "stop" even when they returned a tool
                // call. Keep the compatibility fix without dropping choices.
                if (formattedChoice.message?.tool_calls?.length) {
                    formattedChoice.finish_reason = "tool_calls";
                }
                if (
                    _normalizeFinishReasonAtTokenLimit &&
                    formattedChoice.finish_reason === "stop" &&
                    typeof options.max_tokens === "number" &&
                    typeof data.usage?.completion_tokens === "number" &&
                    data.usage.completion_tokens >= options.max_tokens
                ) {
                    formattedChoice.finish_reason = "length";
                }
                return formattedChoice;
            },
        );

        return withUpstreamRequestUrl(
            {
                ...data,
                id: data.id || `genericopenai-${requestId}`,
                object: data.object || "chat.completion",
                choices,
            },
            requestUrl,
        );
    } catch (thrown: unknown) {
        const error = toServiceError(thrown);
        errorLog(`[${requestId}] Error:`, {
            error: error.message,
            status: error.status,
            model: modelName,
        });
        throw error;
    }
}
