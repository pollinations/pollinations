import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('pollinations:cloudflare-gateway');
const errorLog = debug('pollinations:error');
const CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;

const BASE_URL = 'https://gateway.ai.cloudflare.com/v1/efdcb0933eaac64f27c0b295039b28f2/pollinations-text';

// Note on streaming:
// When options.stream is true, the response will be in Server-Sent Events (SSE) format.
// The client should handle the stream by:
// 1. Reading each event (data: {...})
// 2. Parsing the JSON content
// 3. Concatenating the text chunks
// 4. Handling the final [DONE] event
//
// Example stream response format:
// data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null,"index":0}]}
// data: {"choices":[{"delta":{"content":" world"},"finish_reason":null,"index":0}]}
// data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop","index":0}]}
// data: [DONE]

// Provider configurations
const PROVIDER_CONFIGS = {
    'openai': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        environmentKey: 'AZURE_OPENAI_API_KEY',
    },
    'openai-large': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        environmentKey: 'AZURE_OPENAI_LARGE_API_KEY',
    },
    'deepseek': {
        provider: 'deepseek',
        endpoint: 'chat/completions',
        modelParam: 'model',
        environmentKey: 'AZURE_DEEPSEEK_API_KEY',
    },
    'deepseek-reasoner': {
        provider: 'deepseek',
        endpoint: 'chat/completions',
        modelParam: 'model',
        environmentKey: 'AZURE_DEEPSEEK_API_KEY',
    },
    'mistral': {
        provider: 'mistral',
        endpoint: 'chat/completions',
        modelParam: 'model',
        environmentKey: 'AZURE_MISTRAL_API_KEY',
    },
    'llama': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-70b-chat',
        modelParam: null,
        environmentKey: 'AZURE_LLAMA_API_KEY',
    },
    'llamalight': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-8b-instruct',
        modelParam: null,
        environmentKey: 'AZURE_LLAMA_API_KEY',
    },
    'llamaguard': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llamaguard-7b',
        modelParam: null,
        environmentKey: 'AZURE_LLAMA_API_KEY',
    },
    'claude-hybridspace': {
        provider: 'anthropic',
        endpoint: 'messages',
        modelParam: 'model',
        environmentKey: 'ANTHROPIC_API_KEY',
    },
    'gemini': {
        provider: 'google-ai-studio',
        endpoint: 'models/gemini-pro:generateContent',
        modelParam: null,
        environmentKey: 'GEMINI_API_KEY',
    },
    'gemini-thinking': {
        provider: 'google-ai-studio',
        endpoint: 'models/gemini-pro:generateContent',
        modelParam: null,
        environmentKey: 'GEMINI_API_KEY',
    }
};

/**
 * Generates text using various AI models through Cloudflare's AI Gateway
 * 
 * @param {Array<Object>} messages - Array of message objects with role and content
 * @param {Object} options - Configuration options
 * @param {string} [options.model='openai'] - Model identifier (e.g., 'openai', 'mistral', 'llama')
 * @param {number} [options.temperature=0.7] - Temperature for response generation
 * @param {boolean} [options.stream=false] - Whether to stream the response
 * @param {number} [options.cacheTtl=86400] - Cache TTL in seconds (max 86400 = 24h, ignored if streaming)
 * @param {boolean} [options.skipCache=false] - Whether to skip cache for this request
 * 
 * @returns {Promise<Object>} Response object with:
 *   - Standard OpenAI-compatible response fields
 *   - _metadata object containing:
 *     - provider: The AI provider used
 *     - cacheStatus: Cache hit/miss status
 *     - gateway: 'cloudflare'
 *     - modelId: Specific model identifier
 * 
 * @throws {Error} With enhanced error information including:
 *   - Specific error messages for common Cloudflare AI Gateway errors
 *   - provider: The provider that failed
 *   - model: The model that was requested
 *   - gateway: 'cloudflare'
 */
async function generateText(messages, options = {}) {
    const model = options.model || 'openai';
    const config = PROVIDER_CONFIGS[model];

    if (!config) {
        throw new Error(`Unsupported model: ${model}`);
    }

    // Retrieve the token dynamically from the provider configuration
    const providerToken = process.env[config.environmentKey];
    if (!providerToken) {
        throw new Error(`Missing token for provider: ${config.provider}. Ensure ${config.environmentKey} is set in the environment.`);
    }

    // Build request for the universal endpoint
    const request = {
        provider: config.provider,
        endpoint: config.endpoint,
        headers: {
            'Authorization': `Bearer ${providerToken}`,
            'Content-Type': 'application/json'
        }
    };

    // Configure query based on provider
    switch (config.provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
        case 'anthropic':
            request.query = {
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            if (config.modelParam) {
                request.query[config.modelParam] = model;
            }
            break;

        case 'workers-ai':
            request.query = {
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'google-ai-studio':
            request.query = {
                contents: messages.map(msg => ({
                    role: msg.role,
                    parts: [{ text: msg.content }]
                })),
                generationConfig: {
                    temperature: options.temperature || 0.7
                }
            };
            break;

        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }

    try {
        // Add caching headers if not streaming
        if (!options.stream) {
            request.headers['cf-aig-cache-ttl'] = options.cacheTtl || '86400';  // Default 24 hour cache (maximum allowed)
            if (options.skipCache) {
                request.headers['cf-aig-skip-cache'] = 'true';
            }
        }

        // Log request details
        log('Request to AI Gateway:', {
            url: BASE_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerToken}`,
            },
            body: request,
        });

        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${providerToken}`,
            },
            body: JSON.stringify([request]), // Wrap in array for batch format
        });

        // Log response details
        log('Response received from AI Gateway:', {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
        });

        const responseBody = await response.json();

        if (!response.ok) {
            // Log detailed error
            errorLog('Error response from AI Gateway:', {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody,
            });

            // Handle specific error cases
            switch (response.status) {
                case 401:
                    throw new Error(`Authentication failed for provider ${config.provider}. Check ${config.environmentKey}`);
                case 403:
                    throw new Error(`Access denied for provider ${config.provider}. Verify API key permissions`);
                case 429:
                    throw new Error('Rate limit exceeded. Please try again later');
                case 502:
                    throw new Error(`${config.provider} service is currently unavailable`);
                case 504:
                    throw new Error('Request timeout. The provider took too long to respond');
                default:
                    throw new Error(`API request failed: ${JSON.stringify(responseBody)}`);
            }
        }

        log('Successful response body:', responseBody);

        // The response is an array with one item since we sent one request
        const result = responseBody[0];

        if (!result.success) {
            throw new Error(`Provider request failed: ${JSON.stringify(result.errors)}`);
        }

        // Add cache and provider information to response metadata
        const responseWithMetadata = {
            ...normalizeResponse(result.response, config.provider, model),
            _metadata: {
                provider: config.provider,
                cacheStatus: response.headers.get('cf-aig-cache-status'),
                gateway: 'cloudflare',
                endpoint: config.endpoint,
                environmentKey: config.environmentKey
            }
        };

        return responseWithMetadata;

    } catch (error) {
        // Log unexpected errors with provider context
        errorLog('Error in generateText:', {
            error: error.message,
            provider: config.provider,
            model,
            environmentKey: config.environmentKey,
            endpoint: config.endpoint
        });

        // Enhance error with provider context
        const enhancedError = new Error(error.message);
        enhancedError.provider = config.provider;
        enhancedError.model = model;
        enhancedError.environmentKey = config.environmentKey;
        enhancedError.gateway = 'cloudflare';
        enhancedError.originalError = error;

        throw enhancedError;
    }
}


export { generateText };

