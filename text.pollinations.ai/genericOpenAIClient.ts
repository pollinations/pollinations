import fetch from "node-fetch";
import debug from "debug";
import {
    validateAndNormalizeMessages,
    cleanNullAndUndefined,
    generateRequestId,
    cleanUndefined,
    normalizeOptions,
    convertSystemToUserMessages,
} from "./textGenerationUtils.js";

import { createSseStreamConverter } from "./sseStreamConverter.js";

const log = debug(`pollinations:genericopenai`);
const errorLog = debug(`pollinations:error`);

interface ApiError extends Error {
    status?: number;
    details?: any;
    model?: string;
}

export async function genericOpenAIClient(messages: any[], options: any = {}, config: any): Promise<any> {
    const {
        endpoint,
        authHeaderName = "Authorization",
        authHeaderValue,
        defaultOptions = {},
        formatResponse = null,
        additionalHeaders = {},
    } = config;
    const startTime = Date.now();
    const requestId = generateRequestId();

    log(`[${requestId}] Starting request`, { messageCount: messages?.length || 0, options });

    let normalizedOptions: any;
    let modelName: string;

    try {
        if (!authHeaderValue()) {
            throw new Error("Generic OpenAI API key is not set");
        }

        normalizedOptions = normalizeOptions(options, defaultOptions);
        modelName = normalizedOptions.model;

        const validatedMessages = validateAndNormalizeMessages(messages);
        const requestBody = cleanNullAndUndefined({
            model: modelName,
            messages: validatedMessages,
            ...normalizedOptions,
        });

        log(`[${requestId}] Request body:`, JSON.stringify(requestBody, null, 2));

        const endpointUrl = typeof endpoint === "function"
            ? endpoint(modelName, normalizedOptions)
            : endpoint;

        const headers = {
            [authHeaderName]: authHeaderValue(),
            "Content-Type": "application/json",
            ...additionalHeaders,
        };

        delete requestBody.additionalHeaders;

        log(`[${requestId}] Headers:`, headers);

        const response = await fetch(endpointUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
        });

        if (normalizedOptions.stream) {
            log(`[${requestId}] Streaming response, status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                const errorDetails = parseJsonSafe(errorText) || errorText;

                const error: ApiError = new Error(`${response.status} ${response.statusText}`);
                error.status = response.status;
                error.details = errorDetails;
                error.model = modelName;
                throw error;
            }

            let streamToReturn = response.body;
            if (response.body && formatResponse) {
                streamToReturn = response.body.pipe(
                    createSseStreamConverter((json: any) => {
                        const delta = json?.choices?.[0]?.delta;
                        if (!delta) return json;
                        const mapped = formatResponse(delta, json) ?? delta;
                        return {
                            ...json,
                            choices: [{ ...json.choices[0], delta: mapped }],
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
                choices: [{ delta: { content: "" }, finish_reason: null, index: 0 }],
            };
        }

        log(`[${requestId}] Response status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            const errorDetails = parseJsonSafe(errorText) || errorText;

            const error: ApiError = new Error(`${response.status} ${response.statusText}`);
            error.status = response.status;
            error.details = errorDetails;
            error.model = modelName;
            errorLog(`[${requestId}] API error:`, errorDetails);
            throw error;
        }

        const data: any = await response.json();
        const completionTime = Date.now() - startTime;

        log(`[${requestId}] Completed in ${completionTime}ms, model: ${data.model || modelName}`);

        const originalChoice = data.choices?.[0] ?? {};
        const formattedChoice = formatResponse
            ? formatResponse(originalChoice, requestId, startTime, modelName)
            : originalChoice;

        return {
            ...data,
            id: data.id || `genericopenai-${requestId}`,
            object: data.object || "chat.completion",
            choices: [formattedChoice],
        };
    } catch (error: any) {
        errorLog(`[${requestId}] Error:`, { error: error.message, status: error.status, model: modelName });
        throw error;
    }
}

function parseJsonSafe(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
