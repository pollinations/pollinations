import debug from "debug";
import { remapUpstreamStatus } from "@/error.ts";
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

        if (normalizedOptions.stream) {
            log(
                `[${requestId}] Streaming response, status: ${response.status}`,
            );

            const streamToReturn = ensureOpenAISseDone(response.body);
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

        const formattedChoice = (data.choices?.[0] ?? {}) as CompletionChoice;

        // Force finish_reason to "tool_calls" when tool_calls are present.
        // Some providers (e.g. Vertex AI) return "stop" for tool call responses.
        if (formattedChoice.message?.tool_calls?.length) {
            formattedChoice.finish_reason = "tool_calls";
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
