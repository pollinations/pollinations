import { remapUpstreamStatus } from "@shared/error.ts";
import debug from "debug";
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

// Attach Portkey's served fallback target as internal, non-enumerable metadata
// so tracking can read completion.fallbackTarget while it stays out of every
// JSON.stringify({ ...completion }) response body (the OpenAI-compatible body
// has no such field).
function withFallbackTarget(
    completion: ChatCompletion,
    fallbackTarget: string | undefined,
): ChatCompletion {
    if (fallbackTarget === undefined) return completion;
    Object.defineProperty(completion, "fallbackTarget", {
        value: fallbackTarget,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return completion;
}

function ensureOpenAISseDone(
    source: ReadableStream<Uint8Array> | null,
    publicModel: string,
): ReadableStream<Uint8Array> | null {
    if (!source) return source;

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let seenDone = false;
    let buffer = "";

    const emitLine = (
        line: string,
        controller: TransformStreamDefaultController<Uint8Array>,
    ) => {
        const newline = line.endsWith("\n") ? "\n" : "";
        const withoutNewline = newline ? line.slice(0, -1) : line;
        const carriageReturn = withoutNewline.endsWith("\r") ? "\r" : "";
        const content = carriageReturn
            ? withoutNewline.slice(0, -1)
            : withoutNewline;
        const match = content.match(/^(\s*data:\s*)(.*)$/);
        if (!match) {
            controller.enqueue(encoder.encode(line));
            return;
        }

        const [, prefix, payload] = match;
        if (payload.trim() === "[DONE]") {
            seenDone = true;
        } else {
            try {
                const event = JSON.parse(payload) as Record<string, unknown>;
                if (event && typeof event === "object" && "model" in event) {
                    event.model = publicModel;
                    controller.enqueue(
                        encoder.encode(
                            `${prefix}${JSON.stringify(event)}${carriageReturn}${newline}`,
                        ),
                    );
                    return;
                }
            } catch {
                // Preserve malformed/non-JSON upstream data; tracking handles it.
            }
        }
        controller.enqueue(encoder.encode(line));
    };

    return source.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });
                let lineEnd = buffer.indexOf("\n");
                while (lineEnd !== -1) {
                    emitLine(buffer.slice(0, lineEnd + 1), controller);
                    buffer = buffer.slice(lineEnd + 1);
                    lineEnd = buffer.indexOf("\n");
                }
            },
            flush(controller) {
                buffer += decoder.decode();
                if (buffer) emitLine(buffer, controller);
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
    error.status = remapUpstreamStatus(response.status);
    error.upstreamStatus = response.status;
    error.details = details;
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
    const { endpoint, defaultOptions = {}, additionalHeaders = {} } = config;
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
            jsonMode: _jsonMode,
            modelConfig: _modelConfig,
            modelDef: _modelDef,
            portkeyGatewayUrl: _portkeyGatewayUrl,
            requestedModel: _requestedModel,
            userApiKey: _userApiKey,
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

        const headers = {
            "Content-Type": "application/json",
            ...additionalHeaders,
        };

        log(`[${requestId}] Header keys:`, Object.keys(headers));

        const response = await fetch(endpointUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorDetails = parseJsonSafe(errorText) || errorText;
            errorLog(
                `[${requestId}] API error (${response.status}):`,
                errorDetails,
            );
            throw createApiError(response, errorDetails, modelName);
        }

        // Portkey reports which fallback target served the call via this header
        // (e.g. "config.targets[0]" = primary, "config.targets[1]" = first
        // fallback). Surface it so tracking can record whether a fallback fired.
        const fallbackTarget =
            response.headers.get("x-portkey-last-used-option-index") ??
            undefined;

        if (normalizedOptions.stream) {
            log(
                `[${requestId}] Streaming response, status: ${response.status}`,
            );

            const publicModel = normalizedOptions.requestedModel || modelName;
            const streamToReturn = ensureOpenAISseDone(
                response.body,
                publicModel,
            );
            return withFallbackTarget(
                {
                    id: `genericopenai-${requestId}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(startTime / 1000),
                    model: publicModel,
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
                fallbackTarget,
            );
        }

        const data = (await response.json()) as ChatCompletion;
        log(
            `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
        );

        const formattedChoice = (data.choices?.[0] ?? {}) as CompletionChoice;

        // Force finish_reason to "tool_calls" when tool_calls are present.
        // Some providers (e.g. Vertex AI) return "stop" for tool call responses.
        if (formattedChoice.message?.tool_calls?.length) {
            formattedChoice.finish_reason = "tool_calls";
        }

        return withFallbackTarget(
            {
                ...data,
                id: data.id || `genericopenai-${requestId}`,
                object: data.object || "chat.completion",
                model: normalizedOptions.requestedModel || modelName,
                choices: [formattedChoice],
            },
            fallbackTarget,
        );
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
