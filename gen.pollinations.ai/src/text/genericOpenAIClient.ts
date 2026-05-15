import debug from "debug";
import { createSseStreamConverter } from "./sseStreamConverter.js";
import {
    normalizeOptions,
    validateAndNormalizeMessages,
} from "./textGenerationUtils.js";
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
const DEFAULT_UPSTREAM_TIMEOUT_MS = 90_000;
const STREAM_UPSTREAM_TIMEOUT_MS = 300_000;

function ensureOpenAISseDone(
    source: ReadableStream<Uint8Array> | null,
): ReadableStream<Uint8Array> | null {
    if (!source) return source;

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

function createApiError(
    response: { status: number; statusText: string },
    details: unknown,
    modelName: string,
): ServiceError {
    const statusMessage = `${response.status} ${response.statusText}`;
    const detailMessage = extractErrorMessage(details);
    const error = new Error(
        detailMessage ? `${statusMessage}: ${detailMessage}` : statusMessage,
    ) as ServiceError;
    error.status = response.status;
    error.details = details;
    error.model = modelName;
    return error;
}

type ContentFilterEntry = { filtered?: unknown; severity?: unknown };
type ContentFilterResults = Record<string, ContentFilterEntry | undefined>;

// Azure OpenAI returns prompt_filter_results / content_filter_results when its
// safety pipeline blocks input or output. Returns the first category that was
// flagged, or null if none were.
function detectContentFilterCategory(
    data: ChatCompletion,
    choice: CompletionChoice,
): string | null {
    const candidates: ContentFilterResults[] = [];
    const promptFilterResults = (data as { prompt_filter_results?: unknown[] })
        .prompt_filter_results;
    if (Array.isArray(promptFilterResults)) {
        for (const entry of promptFilterResults) {
            const results = (
                entry as { content_filter_results?: ContentFilterResults }
            ).content_filter_results;
            if (results) candidates.push(results);
        }
    }
    const choiceFilterResults = (
        choice as { content_filter_results?: ContentFilterResults }
    ).content_filter_results;
    if (choiceFilterResults) candidates.push(choiceFilterResults);

    // Only treat a category as blocking when Azure explicitly set filtered=true.
    // severity is annotated even when nothing is blocked (e.g. filtered:false,
    // severity:"low"), so trusting it alone misclassifies upstream failures as
    // client errors.
    for (const result of candidates) {
        for (const [category, entry] of Object.entries(result)) {
            if (!entry || typeof entry !== "object") continue;
            if (entry.filtered === true) return category;
        }
    }
    return null;
}

function isAbortLikeError(error: unknown): boolean {
    return (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")
    );
}

function createTimeoutError(
    modelName: string,
    timeoutMs: number,
): ServiceError {
    const error = new Error(
        `Upstream provider timed out after ${timeoutMs}ms`,
    ) as ServiceError;
    error.status = 504;
    error.model = modelName;
    return error;
}

function parseJsonSafe(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export async function genericOpenAIClient(
    messages: ChatMessage[],
    options: TransformOptions = {},
    config: OpenAIClientConfig,
): Promise<ChatCompletion> {
    const {
        endpoint,
        authHeaderName = "Authorization",
        authHeaderValue,
        defaultOptions = {},
        formatResponse = null,
        additionalHeaders = {},
    } = config;
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    log(`[${requestId}] Starting request`, {
        messageCount: messages?.length || 0,
        model: options.model,
        requestedModel: options.requestedModel,
        stream: options.stream === true,
        optionKeys: Object.keys(options),
    });

    let normalizedOptions: TransformOptions;
    let modelName = "unknown";

    try {
        normalizedOptions = normalizeOptions(options, defaultOptions);
        if (!normalizedOptions.model) {
            throw new Error("Model is required");
        }
        modelName = normalizedOptions.model;

        const validatedMessages = validateAndNormalizeMessages(messages);
        const {
            additionalHeaders: _additionalHeaders,
            isPrivate: _isPrivate,
            jsonMode: _jsonMode,
            modelConfig: _modelConfig,
            modelDef: _modelDef,
            portkeyGatewayUrl: _portkeyGatewayUrl,
            referrer: _referrer,
            requestedModel: _requestedModel,
            userApiKey: _userApiKey,
            userInfo: _userInfo,
            ...cleanedOptions
        } = normalizedOptions;
        const requestBody = cleanNullAndUndefined({
            model: modelName,
            messages: validatedMessages,
            ...cleanedOptions,
        });

        log(`[${requestId}] Request body prepared`, {
            model: modelName,
            messageCount: validatedMessages.length,
            optionKeys: Object.keys(cleanedOptions),
            stream: normalizedOptions.stream === true,
        });

        const endpointUrl =
            typeof endpoint === "function"
                ? endpoint(modelName, normalizedOptions)
                : endpoint;

        const resolvedAuthHeaderValue = authHeaderValue?.();
        const headers = {
            ...(resolvedAuthHeaderValue
                ? { [authHeaderName]: resolvedAuthHeaderValue }
                : {}),
            "Content-Type": "application/json",
            ...additionalHeaders,
        };

        log(`[${requestId}] Header keys:`, Object.keys(headers));

        const timeoutMs = normalizedOptions.stream
            ? STREAM_UPSTREAM_TIMEOUT_MS
            : DEFAULT_UPSTREAM_TIMEOUT_MS;
        let response: Response;
        try {
            response = await fetch(endpointUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (thrown: unknown) {
            if (isAbortLikeError(thrown)) {
                throw createTimeoutError(modelName, timeoutMs);
            }
            throw thrown;
        }

        if (!response.ok) {
            const errorText = await response.text();
            const errorDetails = parseJsonSafe(errorText) || errorText;
            errorLog(
                `[${requestId}] API error (${response.status}):`,
                errorDetails,
            );
            throw createApiError(response, errorDetails, modelName);
        }

        if (normalizedOptions.stream) {
            log(
                `[${requestId}] Streaming response, status: ${response.status}`,
            );

            let streamToReturn: ReadableStream<Uint8Array> | null =
                response.body;
            if (response.body && formatResponse) {
                streamToReturn = response.body.pipeThrough(
                    createSseStreamConverter((json: unknown) => {
                        const parsed = json as ChatCompletion;
                        const delta = parsed?.choices?.[0]?.delta;
                        if (!delta) return json;
                        const mapped = formatResponse(delta, json) ?? delta;
                        return {
                            ...parsed,
                            choices: [
                                {
                                    ...(parsed.choices?.[0] ?? {}),
                                    delta: mapped,
                                },
                            ],
                        };
                    }),
                );
            }
            streamToReturn = ensureOpenAISseDone(streamToReturn);
            return {
                id: `genericopenai-${requestId}`,
                object: "chat.completion.chunk",
                created: Math.floor(startTime / 1000),
                model: modelName,
                stream: true,
                responseStream: streamToReturn,
                choices: [
                    { delta: { content: "" }, finish_reason: null, index: 0 },
                ],
            };
        }

        const data = (await response.json()) as ChatCompletion;
        log(
            `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
        );

        const originalChoice = data.choices?.[0] ?? {};
        const formattedChoice = (
            formatResponse
                ? formatResponse(
                      originalChoice,
                      requestId,
                      startTime,
                      modelName,
                  )
                : originalChoice
        ) as CompletionChoice;

        // Force finish_reason to "tool_calls" when tool_calls are present.
        // Some providers (e.g. Vertex AI) return "stop" for tool call responses.
        if (formattedChoice.message?.tool_calls?.length) {
            formattedChoice.finish_reason = "tool_calls";
        }

        // Reject empty completions from unstable upstream providers.
        const hasContent = !!formattedChoice.message?.content;
        const hasToolCalls = !!formattedChoice.message?.tool_calls?.length;
        const hasTokens = (data.usage?.completion_tokens ?? 0) > 0;

        if (!hasContent && !hasToolCalls && !hasTokens) {
            const finishReason =
                originalChoice.finish_reason || formattedChoice.finish_reason;
            const filterCategory = detectContentFilterCategory(
                data,
                originalChoice,
            );

            if (finishReason === "content_filter" || filterCategory) {
                errorLog(
                    `[${requestId}] Content filter blocked completion: model=%s category=%s`,
                    modelName,
                    filterCategory || "unspecified",
                );
                throw createApiError(
                    { status: 400, statusText: "Bad Request" },
                    {
                        message: filterCategory
                            ? `Request blocked by upstream content filter (${filterCategory})`
                            : "Request blocked by upstream content filter",
                        model: modelName,
                    },
                    modelName,
                );
            }

            if (finishReason === "length") {
                errorLog(
                    `[${requestId}] Empty completion with finish_reason=length: model=%s`,
                    modelName,
                );
                throw createApiError(
                    { status: 400, statusText: "Bad Request" },
                    {
                        message:
                            "Upstream stopped before generating any tokens; increase max_tokens",
                        model: modelName,
                    },
                    modelName,
                );
            }

            errorLog(
                `[${requestId}] Empty completion from upstream: model=%s finish_reason=%s`,
                modelName,
                finishReason || "none",
            );
            throw createApiError(
                { status: 502, statusText: "Bad Gateway" },
                {
                    message: finishReason
                        ? `Upstream provider returned an empty completion (finish_reason=${finishReason})`
                        : "Upstream provider returned an empty completion",
                    model: modelName,
                },
                modelName,
            );
        }

        return {
            ...data,
            id: data.id || `genericopenai-${requestId}`,
            object: data.object || "chat.completion",
            choices: [formattedChoice],
        };
    } catch (thrown: unknown) {
        const error = thrown as ServiceError;
        errorLog(`[${requestId}] Error:`, {
            error: error.message,
            status: error.status,
            model: modelName,
        });
        throw error;
    }
}
