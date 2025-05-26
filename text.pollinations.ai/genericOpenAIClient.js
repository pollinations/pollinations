import fetch from 'node-fetch';
import debug from 'debug';
import {
    validateAndNormalizeMessages, 
    cleanNullAndUndefined,
    ensureSystemMessage,
    generateRequestId,
    cleanUndefined,
    normalizeOptions,
    convertSystemToUserMessages
} from './textGenerationUtils.js';

import { createSseStreamConverter } from './sseStreamConverter.js';

/**
 * Creates a client function for OpenAI-compatible APIs
 * @param {Object} config - Configuration for the client
 * @param {string|Function} config.endpoint - API endpoint URL or function that returns the URL
 * @param {string} config.authHeaderName - Name of the auth header (default: 'Authorization')
 * @param {Function} config.authHeaderValue - Function that returns the auth header value
 * @param {Object} config.modelMapping - Mapping of internal model names to API model names
 * @param {Object} config.systemPrompts - Default system prompts for different models
 * @param {Object} config.defaultOptions - Default options for the client
 * @param {string} config.providerName - Name of the provider (for logging and errors)
 * @param {Function} config.formatResponse - Optional function to format the response
 * @param {Object} config.additionalHeaders - Optional additional headers to include in requests
 * @param {boolean|Function} config.supportsSystemMessages - Whether the API supports system messages (default: true)
 *                                                          Can be a function that receives options and returns boolean
 * @returns {Function} - Client function that handles API requests
 */
export function createOpenAICompatibleClient(config) {
    const {
        endpoint,
        authHeaderName = 'Authorization',
        authHeaderValue,
        modelMapping = {},
        systemPrompts = {},
        defaultOptions = {},
        providerName = 'unknown',
        formatResponse = (x) => x,
        additionalHeaders = {},
        transformRequest = null,
        supportsSystemMessages = true
    } = config;

    const log = debug(`pollinations:${providerName.toLowerCase()}`);
    const errorLog = debug(`pollinations:${providerName.toLowerCase()}:error`);

    // Return the client function
    return async function(messages, options = {}) {
        const startTime = Date.now();
        const requestId = generateRequestId();
        
        log(`[${requestId}] Starting ${providerName} generation request`, {
            timestamp: new Date().toISOString(),
            messageCount: messages?.length || 0,
            options
        });

        try {
            // Check if API key is available
            if (!authHeaderValue()) {
                throw new Error(`${providerName} API key is not set`);
            }

            // Normalize options with defaults
            const normalizedOptions = normalizeOptions(options, defaultOptions);
            
            // Determine which model to use
            const modelKey = normalizedOptions.model;
            const modelName = modelMapping[modelKey] || modelMapping[Object.keys(modelMapping)[0]];
            
            // Validate and normalize messages
            const validatedMessages = validateAndNormalizeMessages(messages);
            
            // Determine if the model supports system messages
            let supportsSystem = supportsSystemMessages;
            if (typeof supportsSystemMessages === 'function') {
                supportsSystem = supportsSystemMessages(normalizedOptions);
            }
            
            // Process messages based on system message support
            let processedMessages;
            if (supportsSystem) {
                // Ensure system message is present if the model supports it
                const defaultSystemPrompt = systemPrompts[modelKey] || null;
                processedMessages = ensureSystemMessage(validatedMessages, normalizedOptions, defaultSystemPrompt);
            } else {
                // For models that don't support system messages, convert them to user messages
                log(`[${requestId}] Model ${modelName} doesn't support system messages, converting to user messages`);
                const defaultSystemPrompt = systemPrompts[modelKey] || null;
                const messagesWithSystem = ensureSystemMessage(validatedMessages, normalizedOptions, defaultSystemPrompt);
                processedMessages = convertSystemToUserMessages(messagesWithSystem);
            }
            
            // Build request body
            const requestBody = {
                model: modelName,
                messages: processedMessages,
                temperature: normalizedOptions.temperature,
                top_p: normalizedOptions.top_p,
                presence_penalty: normalizedOptions.presence_penalty,
                frequency_penalty: normalizedOptions.frequency_penalty,
                stream: normalizedOptions.stream,
                seed: normalizedOptions.seed,
                max_tokens: normalizedOptions.maxTokens,
                // Use the original response_format if provided, otherwise fallback to simple json_object type if jsonMode is true
                response_format: normalizedOptions.response_format || (normalizedOptions.jsonMode ? { type: 'json_object' } : undefined),
                tools: normalizedOptions.tools,
                tool_choice: normalizedOptions.tool_choice,
                modalities: normalizedOptions.modalities,
                audio: normalizedOptions.audio,
            };

            // Clean undefined and null values
            const cleanedRequestBody = cleanNullAndUndefined(requestBody);
            log(`[${requestId}] Cleaned request body (removed null and undefined values):`, 
                JSON.stringify(cleanedRequestBody, null, 2));

            // Apply custom request transformation if provided
            const finalRequestBody = transformRequest
                ? await transformRequest(cleanedRequestBody)
                : cleanedRequestBody;
    

            log(`[${requestId}] Sending request to ${providerName} API`, {
                timestamp: new Date().toISOString(),
                model: cleanedRequestBody.model,
                maxTokens: cleanedRequestBody.max_tokens,
                temperature: cleanedRequestBody.temperature
            });

            log(`[${requestId}] Final request body:`, JSON.stringify(finalRequestBody, null, 2));

            // Determine the endpoint URL
            const endpointUrl = typeof endpoint === 'function' 
                ? endpoint(modelName, normalizedOptions) 
                : endpoint;

            // Prepare headers
            const headers = {
                [authHeaderName]: authHeaderValue(),
                "Content-Type": "application/json",
                ...additionalHeaders,
                ...(finalRequestBody._additionalHeaders || {})
            };
            
            // Remove the _additionalHeaders property from the request body as it's not part of the API
            if (finalRequestBody._additionalHeaders) {
                delete finalRequestBody._additionalHeaders;
            }

            log(`[${requestId}] Request headers:`, headers);

            log(`[${requestId}] Sending request to ${providerName} API at ${endpointUrl}`);

            log(`[${requestId}] Request body:`, JSON.stringify(finalRequestBody, null, 2));
            // Make API request
            const response = await fetch(endpointUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(finalRequestBody)
            });

            // Handle streaming response
            if (normalizedOptions.stream) {
                log(`[${requestId}] Streaming response from ${providerName} API, status: ${response.status}, statusText: ${response.statusText}`);
                const responseHeaders = Object.fromEntries([...response.headers.entries()]);
                
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
                    
                    // For tracking, still keep provider info internally
                    error.originalProvider = providerName;
                    error.provider = "Pollinations";
                    error.model = modelName;
                    
                    throw error;
                }
                
                log(`[${requestId}] Creating streaming response object for ${providerName}`);
                
                // Check if the response is SSE (text/event-stream)
                log(`[${requestId}] Streaming response headers:`, responseHeaders);
                
                let streamToReturn = response.body;
                if (response.body) {
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
                                        delta: mapped
                                    }
                                ]
                            };
                        })
                    );
                }
                return {
                    id: `${providerName.toLowerCase()}-${requestId}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(startTime / 1000),
                    model: modelName,
                    stream: true,
                    responseStream: streamToReturn, // This is the (possibly transformed) stream
                    providerName,
                    choices: [{ delta: { content: '' }, finish_reason: null, index: 0 }],
                    error: !response.ok ? { message: `${providerName} API error: ${response.status} ${response.statusText}` } : undefined
                };

            }

            log(`[${requestId}] Received response from ${providerName} API`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries([...response.headers.entries()])
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
                
                // For tracking, still keep provider info internally
                error.originalProvider = providerName;
                error.provider = "Pollinations";
                error.model = modelName;
                
                throw error;
            }

            // Parse response
            const data = await response.json();
            log(`[${requestId}] Parsed JSON response:`, JSON.stringify(data).substring(0, 500) + '...');
            const completionTime = Date.now() - startTime;

            log(`[${requestId}] Successfully generated text`, {
                timestamp: new Date().toISOString(),
                completionTimeMs: completionTime,
                modelUsed: data.model || modelName,
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens,
                totalTokens: data.usage?.total_tokens
            });

            // Use custom response formatter if provided
            // Pass only choices[0] to formatResponse, reconstruct after
            const originalChoice = data.choices && data.choices[0] ? data.choices[0] : {};
            const formattedChoice = formatResponse(originalChoice, requestId, startTime, modelName);


            // Default response formatting
            // Ensure the response has all expected fields
            if (!data.id) {
                log(`[${requestId}] Adding missing id field to response`);
                
                data.id = `${providerName.toLowerCase()}-${requestId}`;
            }
            
            if (!data.object) {
                data.object = 'chat.completion';
            }
            

            // Reconstruct the response object with the formatted choice
            return {
                ...data,
                choices: [formattedChoice]
            };

            log(`[${requestId}] Final response:`, JSON.stringify(data, null, 2));

            return data;
        } catch (error) {
            errorLog(`[${requestId}] Error in text generation`, {
                timestamp: new Date().toISOString(),
                error: error.message,
                name: error.name,
                stack: error.stack,
                completionTimeMs: Date.now() - startTime
            });
            
            // Simply throw the error
            throw error;
        }
    };
}