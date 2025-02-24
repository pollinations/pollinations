import fetch from 'node-fetch';
import debug from 'debug';
import {
    validateAndNormalizeMessages,
    ensureSystemMessage,
    generateRequestId,
    cleanUndefined,
    createErrorResponse,
    normalizeOptions
} from './textGenerationUtils.js';

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
        formatResponse = null
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
            
            // Ensure system message is present
            const defaultSystemPrompt = systemPrompts[modelKey] || systemPrompts[Object.keys(systemPrompts)[0]];
            const messagesWithSystem = ensureSystemMessage(validatedMessages, normalizedOptions, defaultSystemPrompt);
            
            // Build request body
            const requestBody = {
                model: modelName,
                messages: messagesWithSystem,
                temperature: normalizedOptions.temperature,
                seed: normalizedOptions.seed,
                max_tokens: normalizedOptions.maxTokens,
                response_format: normalizedOptions.jsonMode ? { type: 'json_object' } : undefined,
                tools: normalizedOptions.tools,
                tool_choice: normalizedOptions.tool_choice
            };

            // Clean undefined values
            const cleanedRequestBody = cleanUndefined(requestBody);

            log(`[${requestId}] Sending request to ${providerName} API`, {
                timestamp: new Date().toISOString(),
                model: cleanedRequestBody.model,
                maxTokens: cleanedRequestBody.max_tokens,
                temperature: cleanedRequestBody.temperature
            });

            // Determine the endpoint URL
            const endpointUrl = typeof endpoint === 'function' 
                ? endpoint(modelName) 
                : endpoint;

            // Make API request
            const response = await fetch(endpointUrl, {
                method: "POST",
                headers: {
                    [authHeaderName]: authHeaderValue(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(cleanedRequestBody)
            });

            log(`[${requestId}] Received response from ${providerName} API`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
            });

            // Handle error responses
            if (!response.ok) {
                const errorText = await response.text();
                errorLog(`[${requestId}] ${providerName} API error`, {
                    timestamp: new Date().toISOString(),
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                
                return createErrorResponse(
                    new Error(`${providerName} API error: ${response.status} ${response.statusText} - ${errorText}`),
                    providerName
                );
            }

            // Parse response
            const data = await response.json();
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
            if (formatResponse) {
                return formatResponse(data, requestId, startTime, modelName);
            }

            // Default response formatting
            // Ensure the response has all expected fields
            if (!data.id) {
                data.id = `${providerName.toLowerCase()}-${requestId}`;
            }
            
            if (!data.object) {
                data.object = 'chat.completion';
            }
            
            if (!data.usage) {
                data.usage = {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                };
            }

            return data;
        } catch (error) {
            errorLog(`[${requestId}] Error in text generation`, {
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack,
                completionTimeMs: Date.now() - startTime
            });
            
            return createErrorResponse(error, providerName);
        }
    };
}