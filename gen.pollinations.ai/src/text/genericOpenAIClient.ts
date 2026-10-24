import { collectUpstreamHeaders } from "@shared/error.ts";
import debug from "debug";
import { createParser } from "eventsource-parser";
import { apiErrorStatus } from "./errors.ts";
import { prepareMessages } from "./textGenerationUtils.js";
import type {
    ChatCompletion,
    ChatMessage,
    CompletionChoice,
    OpenAIClientConfig,
    ServiceError,
    TransformOptions,
} from "./types.js";
import {
    cleanNullAndUndefined,
    isPlainObject,
} from "./utils/objectCleaners.js";

const log = debug("pollinations:genericopenai");
const errorLog = debug("pollinations:error");
const DONE_EVENT_PATTERN = /data:\s*\[DONE\]/;

// Attach internal response metadata as non-enumerable properties so downstream
// handling can use it without adding fields to OpenAI-compatible response bodies.
export function withUpstreamRequestUrl(
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

/** Translate Mistral thinking chunks into the existing OpenAI response fields. */
function normalizeMistralContent(
    completion: Pick<ChatCompletion, "choices">,
): void {
    for (const choice of completion.choices ?? []) {
        for (const message of [choice.message, choice.delta]) {
            if (!message || !Array.isArray(message.content)) continue;
            const parts = message.content;
            if (
                !parts.every(
                    (part) =>
                        isPlainObject(part) &&
                        (part.type === "text" || part.type === "thinking"),
                )
            )
                continue;
            let text = "";
            let reasoning = "";
            for (const part of parts) {
                if (!isPlainObject(part)) continue;
                if (part.type === "text" && typeof part.text === "string") {
                    text += part.text;
                } else if (
                    part.type === "thinking" &&
                    Array.isArray(part.thinking)
                ) {
                    for (const chunk of part.thinking) {
                        if (
                            isPlainObject(chunk) &&
                            typeof chunk.text === "string"
                        )
                            reasoning += chunk.text;
                    }
                }
            }
            message.content = text;
            if (reasoning) message.reasoning_content = reasoning;
        }
    }
}

function removeReasoning(completion: Pick<ChatCompletion, "choices">): void {
    for (const choice of completion.choices ?? []) {
        for (const message of [choice.message, choice.delta]) {
            if (!message) continue;
            delete message.reasoning;
            delete message.reasoning_content;
            delete message.reasoning_details;
        }
    }
}

function transformStreamCompletions(
    source: ReadableStream<Uint8Array>,
    transform: (completion: ChatCompletion) => void,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let parser: ReturnType<typeof createParser>;
    return source.pipeThrough(
        new TransformStream({
            start(controller) {
                parser = createParser({
                    onEvent(event) {
                        let data = event.data;
                        if (data.trim() !== "[DONE]") {
                            const completion = JSON.parse(
                                data,
                            ) as ChatCompletion;
                            transform(completion);
                            data = JSON.stringify(completion);
                        }
                        const fields: string[] = [];
                        if (event.event !== undefined)
                            fields.push(`event: ${event.event}`);
                        if (event.id !== undefined)
                            fields.push(`id: ${event.id}`);
                        for (const line of data.split("\n"))
                            fields.push(`data: ${line}`);
                        controller.enqueue(
                            encoder.encode(`${fields.join("\n")}\n\n`),
                        );
                    },
                });
            },
            transform(chunk) {
                parser.feed(decoder.decode(chunk, { stream: true }));
            },
            flush() {
                parser.feed(`${decoder.decode()}\n\n`);
                parser.reset({ consume: true });
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
 * otherwise successful completion. Normalize explicit rate limits and input/
 * policy rejections; other finish errors (e.g. malformed tool output) stay unchanged.
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
            apiErrorStatus(details, 502) >= 500
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

function assertCompletionOk(
    completion: ChatCompletion,
    responseBody: string,
    response: Response,
    modelName: string,
    requestUrl: URL,
): void {
    const responseError = responseBodyError(completion);
    if (!responseError) return;
    const details =
        typeof responseError === "string"
            ? { message: responseError }
            : responseError;
    const error = new Error(
        details.message || "Text generation failed",
    ) as ServiceError;
    const upstreamStatus =
        typeof details.status === "number"
            ? details.status
            : typeof details.code === "number" &&
                details.code >= 400 &&
                details.code <= 599
              ? details.code
              : undefined;
    error.status = apiErrorStatus(details, upstreamStatus ?? 502);
    error.upstreamStatus = upstreamStatus;
    error.details = details.details ?? details;
    error.responseBody = responseBody;
    error.model = modelName;
    error.requestUrl = requestUrl;
    error.upstreamHeaders = collectUpstreamHeaders(response.headers);
    throw error;
}

/** Catch an opening error while fallback is still possible; replay every byte. */
async function checkStreamStart(
    body: ReadableStream<Uint8Array>,
    response: Response,
    modelName: string,
    requestUrl: URL,
): Promise<ReadableStream<Uint8Array>> {
    if (!response.headers.get("content-type")?.includes("text/event-stream"))
        return body;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let firstEventSeen = false;
    let heartbeatSeen = false;
    let ended = false;
    const parser = createParser({
        // Keepalives must reach the caller without waiting for model output.
        onComment() {
            heartbeatSeen = true;
        },
        onEvent(event) {
            if (firstEventSeen || heartbeatSeen) return;
            firstEventSeen = true;
            const completion = parseJsonSafe(event.data);
            if (completion && typeof completion === "object") {
                assertCompletionOk(
                    completion as ChatCompletion,
                    event.data,
                    response,
                    modelName,
                    requestUrl,
                );
            }
        },
    });
    try {
        // Bound lookahead for a missing separator or an oversized first event.
        while (!firstEventSeen && !heartbeatSeen && bytes < 64 * 1024) {
            const { value, done } = await reader.read();
            if (done) {
                ended = true;
                parser.feed(`${decoder.decode()}\n\n`);
                break;
            }
            chunks.push(value);
            bytes += value.byteLength;
            parser.feed(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
        throw withUpstreamContext(error, requestUrl);
    }
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            if (ended) {
                reader.releaseLock();
                controller.close();
            }
        },
        async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
                reader.releaseLock();
                controller.close();
            } else controller.enqueue(value);
        },
        cancel(reason) {
            const cancelled = reader.cancel(reason);
            reader.releaseLock();
            return cancelled;
        },
    });
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
    const hideReasoning =
        options.include_reasoning === false ||
        (options.reasoning as { exclude?: boolean } | undefined)?.exclude ===
            true;
    const normalizeContent = options.modelConfig?.useMistralChatFormat === true;
    const transformCompletion = (completion: ChatCompletion) => {
        if (normalizeContent) normalizeMistralContent(completion);
        if (hideReasoning) removeReasoning(completion);
    };
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
            key: _key,
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

        if (normalizeContent && isPlainObject(requestBody)) {
            if (requestBody.seed !== undefined) {
                requestBody.random_seed = requestBody.seed;
                delete requestBody.seed;
            }
            const reasoning = requestBody.reasoning;
            if (
                requestBody.reasoning_effort === undefined &&
                isPlainObject(reasoning)
            ) {
                if (reasoning.enabled === false)
                    requestBody.reasoning_effort = "none";
                else if (typeof reasoning.effort === "string")
                    requestBody.reasoning_effort = reasoning.effort;
            }
            delete requestBody.reasoning;
            delete requestBody.include_reasoning;
        }

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
            const checkedBody = await checkStreamStart(
                response.body,
                response,
                modelName,
                requestUrl,
            );
            const streamToReturn = ensureOpenAISseDone(
                hideReasoning || normalizeContent
                    ? transformStreamCompletions(
                          checkedBody,
                          transformCompletion,
                      )
                    : checkedBody,
            );
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
        transformCompletion(data);
        assertCompletionOk(data, responseBody, response, modelName, requestUrl);
        log(
            `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
        );

        const choices = (data.choices?.length ? data.choices : [{}]).map(
            (choice): CompletionChoice => {
                const formattedChoice = { ...choice };
                if (formattedChoice.message) {
                    const message = { ...formattedChoice.message };
                    // DeepInfra returns null for optional fields that Chat
                    // request messages require to be absent rather than null.
                    if (message.name === null) delete message.name;
                    if (message.tool_calls === null) delete message.tool_calls;
                    formattedChoice.message = message;
                }
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
