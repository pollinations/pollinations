import debug from "debug";
import fetch from "node-fetch";
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

function createApiError(
    response: { status: number; statusText: string },
    details: unknown,
    modelName: string,
): ServiceError {
    const error = new Error(
        `${response.status} ${response.statusText}`,
    ) as ServiceError;
    error.status = response.status;
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
    const {
        endpoint,
        authHeaderName = "Authorization",
        authHeaderValue,
        defaultOptions = {},
        formatResponse = null,
        additionalHeaders = {},
    } = config;
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    log(`[${requestId}] Starting request`, {
        messageCount: messages?.length || 0,
        options,
    });

    let normalizedOptions: TransformOptions;
    let modelName = "unknown";

    try {
        if (!authHeaderValue()) {
            throw new Error("Generic OpenAI API key is not set");
        }

        normalizedOptions = normalizeOptions(options, defaultOptions);
        modelName = normalizedOptions.model;

        const validatedMessages = validateAndNormalizeMessages(messages);
        const { additionalHeaders: _drop, ...cleanedOptions } =
            normalizedOptions;
        const requestBody = cleanNullAndUndefined({
            model: modelName,
            messages: validatedMessages,
            ...cleanedOptions,
        });

        log(
            `[${requestId}] Request body:`,
            JSON.stringify(requestBody, null, 2),
        );

        const endpointUrl =
            typeof endpoint === "function"
                ? endpoint(modelName, normalizedOptions)
                : endpoint;

        const headers = {
            [authHeaderName]: authHeaderValue(),
            "Content-Type": "application/json",
            ...additionalHeaders,
        };

        log(`[${requestId}] Headers:`, headers);

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

            let streamToReturn = response.body;
            if (response.body && formatResponse) {
                streamToReturn = response.body.pipe(
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
