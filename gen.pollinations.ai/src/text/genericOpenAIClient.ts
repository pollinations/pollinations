import { collectUpstreamHeaders, remapUpstreamStatus } from "@shared/error.ts";
import debug from "debug";
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

// Attach internal response metadata as non-enumerable properties so downstream
// handling can use it without adding fields to OpenAI-compatible response bodies.
function withResponseMetadata(
    completion: ChatCompletion,
    fallbackTarget: string | undefined,
    requestUrl: URL,
): ChatCompletion {
    Object.defineProperty(completion, "upstreamRequestUrl", {
        value: requestUrl,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    if (fallbackTarget !== undefined) {
        Object.defineProperty(completion, "fallbackTarget", {
            value: fallbackTarget,
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return completion;
}

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
    response: Response,
    details: unknown,
    modelName: string,
    requestUrl: URL,
): ServiceError {
    const statusMessage = `${response.status} ${response.statusText}`;
    const detailMessage = extractErrorMessage(details);
    const error = new Error(
        detailMessage ? `${statusMessage}: ${detailMessage}` : statusMessage,
    ) as ServiceError;
    error.status = isClientInputError(details)
        ? 400
        : remapUpstreamStatus(response.status);
    error.upstreamStatus = response.status;
    error.details = details;
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

const MESSAGE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function prepareMessages(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) {
        const error = new Error(
            "Messages must be a non-empty array",
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    return messages.map((message) => {
        const emptyUserContent =
            message.role === "user" &&
            (!message.content ||
                (typeof message.content === "string" &&
                    message.content.trim() === "") ||
                (Array.isArray(message.content) &&
                    message.content.length === 0));
        const missingAssistantContent =
            message.role === "assistant" && message.content === undefined;
        const invalidName =
            message.name !== undefined &&
            (typeof message.name !== "string" ||
                !MESSAGE_NAME_PATTERN.test(message.name));

        if (invalidName && ["tool", "function"].includes(message.role)) {
            const error = new Error(
                `Invalid message name for role '${message.role}'. Names must match ^[a-zA-Z0-9_-]{1,64}$.`,
            ) as ServiceError;
            error.status = 400;
            throw error;
        }
        if (!emptyUserContent && !missingAssistantContent && !invalidName)
            return message;

        const prepared = {
            ...message,
            ...(emptyUserContent
                ? { content: "Please provide a response." }
                : missingAssistantContent
                  ? { content: message.tool_calls ? null : "" }
                  : {}),
        };
        if (invalidName) delete prepared.name;
        return prepared;
    });
}

export async function genericOpenAIClient(
    messages: ChatMessage[],
    options: TransformOptions = {},
    config: OpenAIClientConfig,
): Promise<ChatCompletion> {
    const {
        endpoint,
        defaultOptions = {},
        additionalHeaders = {},
        fetcher = fetch,
    } = config;
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

    let requestOptions: TransformOptions;
    let modelName = "unknown";

    try {
        requestOptions = {
            ...defaultOptions,
            ...options,
        } as TransformOptions;
        if (!requestOptions.model) {
            throw new Error("Model is required");
        }
        modelName = requestOptions.model;

        const preparedMessages = prepareMessages(messages);
        const {
            additionalHeaders: _additionalHeaders,
            modelConfig: _modelConfig,
            modelDef: _modelDef,
            normalizeFinishReasonAtTokenLimit:
                _normalizeFinishReasonAtTokenLimit,
            portkeyGatewayUrl: _portkeyGatewayUrl,
            requestedModel: _requestedModel,
            userApiKey: _userApiKey,
            ...cleanedOptions
        } = requestOptions;
        const requestBody = cleanNullAndUndefined({
            model: modelName,
            messages: preparedMessages,
            ...cleanedOptions,
        });

        log(`[${requestId}] Request body prepared`, {
            model: modelName,
            messageCount: preparedMessages.length,
            optionKeys: Object.keys(cleanedOptions),
            stream: requestOptions.stream === true,
        });

        const endpointUrl =
            typeof endpoint === "function"
                ? endpoint(modelName, requestOptions)
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
            throw createApiError(response, errorDetails, modelName, requestUrl);
        }

        // Portkey reports which fallback target served the call via this header
        // (e.g. "config.targets[0]" = primary, "config.targets[1]" = first
        // fallback). Surface it so tracking can record whether a fallback fired.
        const fallbackTarget =
            response.headers.get("x-portkey-last-used-option-index") ??
            undefined;

        if (requestOptions.stream) {
            log(
                `[${requestId}] Streaming response, status: ${response.status}`,
            );

            const streamToReturn = ensureOpenAISseDone(response.body);
            return withResponseMetadata(
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
                fallbackTarget,
                requestUrl,
            );
        }

        let data: ChatCompletion;
        try {
            data = (await response.json()) as ChatCompletion;
        } catch (thrown: unknown) {
            throw withUpstreamContext(thrown, requestUrl);
        }
        if (data.error) {
            const errorDetails =
                typeof data.error === "string"
                    ? { message: data.error }
                    : data.error;
            const error = new Error(
                errorDetails.message || "Text generation failed",
            ) as ServiceError;
            error.status = isClientInputError(errorDetails)
                ? 400
                : typeof errorDetails.status === "number"
                  ? remapUpstreamStatus(errorDetails.status)
                  : 502;
            error.upstreamStatus =
                typeof errorDetails.status === "number"
                    ? errorDetails.status
                    : undefined;
            error.details = errorDetails.details;
            error.model = modelName;
            error.requestUrl = requestUrl;
            error.upstreamHeaders = collectUpstreamHeaders(response.headers);
            throw error;
        }
        log(
            `[${requestId}] Completed in ${Date.now() - startTime}ms, model: ${data.model || modelName}`,
        );

        const formattedChoice = (data.choices?.[0] ?? {}) as CompletionChoice;

        // Force finish_reason to "tool_calls" when tool_calls are present.
        // Some providers (e.g. Vertex AI) return "stop" for tool call responses.
        if (formattedChoice.message?.tool_calls?.length) {
            formattedChoice.finish_reason = "tool_calls";
        }

        if (
            _normalizeFinishReasonAtTokenLimit &&
            formattedChoice.finish_reason === "stop" &&
            typeof requestOptions.max_tokens === "number" &&
            typeof data.usage?.completion_tokens === "number" &&
            data.usage.completion_tokens >= requestOptions.max_tokens
        ) {
            formattedChoice.finish_reason = "length";
        }

        return withResponseMetadata(
            {
                ...data,
                id: data.id || `genericopenai-${requestId}`,
                object: data.object || "chat.completion",
                choices: [formattedChoice],
            },
            fallbackTarget,
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
