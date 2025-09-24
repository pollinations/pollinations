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
import { sendTinybirdEvent } from "./observability/tinybirdTracker.js";



const log = debug(`pollinations:genericopenai`);
const errorLog = debug(`pollinations:error`);

/**
 * Generic OpenAI-compatible API client function
 * @param {Array} messages - Array of messages for the conversation
 * @param {Object} options - Options for the request (default: {})
 * @param {Object} config - Configuration for the client
 * @param {string|Function} config.endpoint - API endpoint URL or function that returns the URL
 * @param {string} config.authHeaderName - Name of the auth header (default: 'Authorization')
 * @param {Function} config.authHeaderValue - Function that returns the auth header value
 * @param {Object} config.defaultOptions - Default options for the client
 * @param {Function} config.formatResponse - Optional function to format the response
 * @param {Object} config.additionalHeaders - Optional additional headers to include in requests
 * @returns {Object} - API response object
 */
export async function genericOpenAIClient(messages, options = {}, config) {
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

        log(`[${requestId}] Starting generic openai generation request`, {
            timestamp: new Date().toISOString(),
            messageCount: messages?.length || 0,
            options,
        });

        // Declare normalizedOptions and modelName in outer scope so they're available in catch block
        let normalizedOptions;
        let modelName;

        try {
            // Check if API key is available
            if (!authHeaderValue()) {
                throw new Error(`Generic OpenAI API key is not set`);
            }

            // Normalize options with defaults
            normalizedOptions = normalizeOptions(options, defaultOptions);

            // Use the model name directly (mapping is now handled upstream)
            modelName = normalizedOptions.model;

            // Validate and normalize messages
            const validatedMessages = validateAndNormalizeMessages(messages);

            // System message handling is now done via transforms before reaching this client
            const processedMessages = validatedMessages;

            // Build request body using spread - normalization already handled upstream
            const requestBody = {
                model: modelName,
                messages: processedMessages,
                ...normalizedOptions,
            };

            // Clean undefined and null values
            const cleanedRequestBody = cleanNullAndUndefined(requestBody);
            log(
                `[${requestId}] Cleaned request body (removed null and undefined values):`,
                JSON.stringify(cleanedRequestBody, null, 2),
            );

            const finalRequestBody = cleanedRequestBody;

            log(`[${requestId}] Sending request to Generic OpenAI API`, {
                timestamp: new Date().toISOString(),
                model: cleanedRequestBody.model,
                maxTokens: cleanedRequestBody.max_tokens,
                temperature: cleanedRequestBody.temperature,
            });

            log(
                `[${requestId}] Final request body:`,
                JSON.stringify(finalRequestBody, null, 2),
            );

            // Determine the endpoint URL
            const endpointUrl =
                typeof endpoint === "function"
                    ? endpoint(modelName, normalizedOptions)
                    : endpoint;

            // Prepare headers
            const headers = {
                [authHeaderName]: authHeaderValue(),
                "Content-Type": "application/json",
                ...additionalHeaders,
            };

            // Remove the additionalHeaders property from the request body as it's not part of the API
            if (finalRequestBody.additionalHeaders) {
                delete finalRequestBody.additionalHeaders;
            }

            log(`[${requestId}] Request headers:`, headers);

            log(
                `[${requestId}] Request body:`,
                JSON.stringify(finalRequestBody, null, 2),
            );
            // Make API request
            const response = await fetch(endpointUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(finalRequestBody),
            });

            // Handle streaming response
            if (normalizedOptions.stream) {
                log(
                    `[${requestId}] Streaming response from Generic OpenAI API, status: ${response.status}, statusText: ${response.statusText}`,
                );
                const responseHeaders = Object.fromEntries([
                    ...response.headers.entries(),
                ]);

                // Check if the response is successful for streaming
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorDetails = null;
                    try {
                        errorDetails = JSON.parse(errorText);
                    } catch (e) {
                        errorDetails = errorText;
                    }

                    // Build a cleaner error message
                    const errorMessage = `${response.status} ${response.statusText}`;

                    const error = new Error(errorMessage);
                    error.status = response.status;
                    error.details = errorDetails;

                    error.model = modelName;

                    throw error;
                }

                // Check if the response is SSE (text/event-stream)
                log(
                    `[${requestId}] Streaming response headers:`,
                    responseHeaders,
                );

                let streamToReturn = response.body;
                if (response.body && formatResponse) {
                    // Map each SSE event chunk's delta through formatResponse
                    streamToReturn = response.body.pipe(
                        createSseStreamConverter((json) => {
                            // Defensive: extract delta from OpenAI chunk
                            let delta = json?.choices?.[0]?.delta;
                            if (!delta) return json; // fallback: passthrough
                            // Some formatResponse expect the full chunk, some just the delta
                            // We'll pass the delta as the first arg, and the full chunk as second if needed
                            let mapped = formatResponse(delta, json);
                            // If formatResponse returns null/undefined, fallback to original delta
                            if (mapped == null) mapped = delta;
                            // Re-wrap in OpenAI chunk structure for downstream
                            return {
                                ...json,
                                choices: [
                                    {
                                        ...json.choices[0],
                                        delta: mapped,
                                    },
                                ],
                            };
                        }),
                    );
                }
                return {
                    id: `${"genericopenai".toLowerCase()}-${requestId}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(startTime / 1000),
                    model: modelName,
                    stream: true,
                    responseStream: streamToReturn, // This is the (possibly transformed) stream,
                    choices: [
                        {
                            delta: { content: "" },
                            finish_reason: null,
                            index: 0,
                        },
                    ],
                    error: !response.ok
                        ? {
                              message: `Generic OpenAI API error: ${response.status} ${response.statusText}`,
                          }
                        : undefined,
                };
            }

            log(`[${requestId}] Received response from Generic OpenAI API`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries([...response.headers.entries()]),
            });

            // Handle error responses
            if (!response.ok) {
                const errorText = await response.text();
                let errorDetails = null;
                try {
                    errorDetails = JSON.parse(errorText);
                } catch (e) {
                    errorDetails = errorText;
                }

                // Build a cleaner error message
                const errorMessage = `${response.status} ${response.statusText}`;

                const error = new Error(errorMessage);
                error.status = response.status;
                error.details = errorDetails;
                


                error.model = modelName;
                errorLog(`[${requestId}] Error from Generic OpenAI API:`, errorDetails);
                errorLog(`[${requestId}] Error from Generic OpenAI API: messages roles:`, messages.map((m) => m.role));
                throw error;
            }

            // Parse response
            const data = await response.json();
            log(
                `[${requestId}] Parsed JSON response:`,
                JSON.stringify(data).substring(0, 500) + "...",
            );
            const completionTime = Date.now() - startTime;

            const modelUsed = data.model || modelName;
            
            log(`[${requestId}] Successfully generated text`, {
                timestamp: new Date().toISOString(),
                completionTimeMs: completionTime,
                modelUsed,
                // Pass the complete usage object instead of extracting fields
                usage: data.usage,
            });

            // Send telemetry to Tinybird
            const endTime = new Date();
            sendTinybirdEvent({
                startTime: new Date(startTime),
                endTime,
                // Use requestedModel for the originally requested model
                model: normalizedOptions.requestedModel,
                // model_used should be the provider-returned model identifier
                modelUsed: data.model,
                duration: completionTime,
                status: "success",
                // Pass the entire usage object rather than individual fields
                usage: data.usage,
                // Include raw response data for moderation detection
                choices: data.choices,
                project: "text.pollinations.ai",
                environment: process.env.NODE_ENV || "production",
                // Spread all user information for better data retention
                ...normalizedOptions.userInfo,
                // Include these key fields explicitly for backwards compatibility
                user:
                    normalizedOptions.userInfo?.username ||
                    normalizedOptions.userInfo?.userId ||
                    "anonymous",
                referrer: normalizedOptions.userInfo?.referrer || "unknown",
                cf_ray: normalizedOptions.userInfo?.cf_ray || "",
                organization: normalizedOptions.userInfo?.userId
                    ? "pollinations"
                    : undefined,
                tier: normalizedOptions.userInfo?.tier || "seed",
            }).catch((err) => {
                errorLog(
                    `[${requestId}] Failed to send telemetry to Tinybird`,
                    err,
                );
            });



            // Use custom response formatter if provided
            // Pass only choices[0] to formatResponse, reconstruct after
            const originalChoice =
                data.choices && data.choices[0] ? data.choices[0] : {};
            const formattedChoice = formatResponse
                ? formatResponse(
                      originalChoice,
                      requestId,
                      startTime,
                      modelName,
                  )
                : originalChoice;

            // Default response formatting
            // Ensure the response has all expected fields
            if (!data.id) {
                log(`[${requestId}] Adding missing id field to response`);

                data.id = `genericopenai-${requestId}`;
            }

            if (!data.object) {
                data.object = "chat.completion";
            }

            // Reconstruct the response object with the formatted choice
            return {
                ...data,
                choices: [formattedChoice],
            };

        } catch (error) {
            errorLog(`[${requestId}] Error in text generation`, {
                timestamp: new Date().toISOString(),
                error: error.message,
                model: modelName,
                provider: config.provider,
                requestId,
            });

            // Send error telemetry to Tinybird
            const endTime = new Date();
            const completionTime = endTime.getTime() - startTime;

            sendTinybirdEvent({
                startTime: new Date(startTime),
                endTime,
                requestId,
                // Use requestedModel for the originally requested model
                model: normalizedOptions.requestedModel,
                duration: completionTime,
                status: "error",
                error,
                project: "text.pollinations.ai",
                environment: process.env.NODE_ENV || "production",
                // Include user information if available - prioritize username for better identification
                user:
                    normalizedOptions.userInfo?.username ||
                    normalizedOptions.userInfo?.userId ||
                    "anonymous",
                username: normalizedOptions.userInfo?.username, // Explicitly include username field
                referrer: normalizedOptions.userInfo?.referrer || "unknown",
                cf_ray: normalizedOptions.userInfo?.cf_ray || "",
                organization: normalizedOptions.userInfo?.userId
                    ? "pollinations"
                    : undefined,
                tier: normalizedOptions.userInfo?.tier || "seed",
            }).catch((err) => {
                errorLog(
                    `[${requestId}] Failed to send error telemetry to Tinybird`,
                    err,
                );
            });

            // Simply throw the error
            throw error;
        }
}