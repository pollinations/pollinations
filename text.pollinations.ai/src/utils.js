import debug from 'debug';

/**
 * Creates a standardized logger for a provider
 * @param {string} provider - The name of the provider (e.g., 'openai', 'cloudflare')
 * @returns {Object} Object containing log and errorLog functions
 */
export function setupLogging(provider) {
    return {
        log: debug(`pollinations:${provider}`),
        errorLog: debug(`pollinations:${provider}:error`)
    };
}

/**
 * Handles system message logic for chat messages
 * @param {Array} messages - Array of chat messages
 * @param {Object} options - Options including jsonMode and other settings
 * @param {string} defaultSystemPrompt - Default system prompt to use if none exists
 * @returns {Array} Updated messages array with system message if needed
 */
export function handleSystemMessage(messages, options, defaultSystemPrompt) {
    const hasSystem = messages.some(message => message.role === 'system');
    
    if (!hasSystem) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : defaultSystemPrompt;
        return [{ role: 'system', content: systemContent }, ...messages];
    }

    if (options.jsonMode) {
        return messages.map(message => {
            if (message.role === 'system' && !containsJSON(message.content)) {
                return {
                    ...message,
                    content: `${message.content} Respond with JSON.`
                };
            }
            return message;
        });
    }

    return messages;
}

/**
 * Creates a standardized request body for API calls
 * @param {Array} messages - Array of chat messages
 * @param {Object} options - Request options
 * @param {Object} defaults - Default values for the provider
 * @returns {Object} Standardized request body
 */
export function createRequestBody(messages, options, defaults = {}) {
    const body = {
        messages,
        max_tokens: options.max_tokens || defaults.max_tokens || 4096,
        temperature: options.temperature || defaults.temperature,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools: options.tools,
        tool_choice: options.tool_choice
    };

    if (typeof options.seed === 'number') {
        body.seed = Math.floor(options.seed);
    }

    // Remove undefined values
    return Object.fromEntries(
        Object.entries(body).filter(([_, value]) => value !== undefined)
    );
}

/**
 * Standardizes response format across different providers
 * @param {Object} response - Provider-specific response
 * @param {string} provider - Provider name
 * @returns {Object} Standardized response object
 */
export function standardizeResponse(response, provider) {
    // Handle error responses
    if (response.error) {
        return {
            error: {
                message: response.error.message || `${provider} API error`,
                code: response.error.code || 500,
                metadata: {
                    raw: response.error,
                    provider_name: provider
                }
            }
        };
    }

    // Standard successful response format
    return {
        choices: [{
            message: {
                role: 'assistant',
                content: getResponseContent(response)
            },
            finish_reason: getFinishReason(response)
        }],
        model: response.model,
        created: response.created || Math.floor(Date.now() / 1000),
        usage: response.usage || {}
    };
}

// Helper functions
function containsJSON(text) {
    return text.toLowerCase().includes('json');
}

function getResponseContent(response) {
    // Handle different response formats from various providers
    if (response.choices?.[0]?.message?.content) {
        return response.choices[0].message.content;
    }
    if (response.result?.response) {
        return response.result.response;
    }
    if (typeof response === 'string') {
        return response;
    }
    return '';
}

function getFinishReason(response) {
    return response.choices?.[0]?.finish_reason || 'stop';
}

/**
 * Creates a model mapping with fallback handling
 * @param {Object} mapping - Provider-specific model mapping
 * @param {string} defaultModel - Default model key to use
 * @returns {Function} Function that returns the mapped model name
 */
export function createModelMapping(mapping, defaultModel) {
    return (modelKey) => mapping[modelKey] || mapping[defaultModel] || modelKey;
}