import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('pollinations:cloudflare-gateway');
const errorLog = debug('pollinations:error');

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_GATEWAY_ID = process.env.CLOUDFLARE_GATEWAY_ID;
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
        modelParam: 'model'
    },
    'openai-large': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model'
    },
    'deepseek': {
        provider: 'deepseek',
        endpoint: 'chat/completions',
        modelParam: 'model'
    },
    'deepseek-reasoner': {
        provider: 'deepseek',
        endpoint: 'chat/completions',
        modelParam: 'model'
    },
    'mistral': {
        provider: 'mistral',
        endpoint: 'chat/completions',
        modelParam: 'model'
    },
    'llama': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-70b-chat',
        modelParam: null
    },
    'llamalight': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-8b-instruct',
        modelParam: null
    },
    'llamaguard': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llamaguard-7b',
        modelParam: null
    },
    'claude-hybridspace': {
        provider: 'anthropic',
        endpoint: 'messages',
        modelParam: 'model'
    },
    'gemini': {
        provider: 'google-ai-studio',
        endpoint: 'models/gemini-pro:generateContent',
        modelParam: null
    },
    'gemini-thinking': {
        provider: 'google-ai-studio',
        endpoint: 'models/gemini-pro:generateContent',
        modelParam: null
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

    if (!CLOUDFLARE_AUTH_TOKEN) {
        throw new Error('Missing required Cloudflare configuration');
    }

    // Build request for the universal endpoint
    const request = {
        provider: config.provider,
        endpoint: config.endpoint,
        headers: {
            'Authorization': `Bearer ${CLOUDFLARE_AUTH_TOKEN}`,
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

        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLOUDFLARE_AUTH_TOKEN}`
            },
            body: JSON.stringify([request]) // Wrap in array for batch format
        });

        if (!response.ok) {
            const error = await response.json();
            
            // Handle specific Cloudflare AI Gateway errors
            switch (response.status) {
                case 401:
                    throw new Error('Unauthorized: Invalid Cloudflare AI Gateway token');
                case 403:
                    throw new Error('Forbidden: Access denied to the requested provider');
                case 429:
                    throw new Error('Rate limit exceeded. Please try again later');
                case 502:
                    throw new Error('Provider service is currently unavailable');
                case 504:
                    throw new Error('Request timeout. The provider took too long to respond');
                default:
                    throw new Error(`API request failed: ${JSON.stringify(error)}`);
            }
        }

        // Log cache status
        const cacheStatus = response.headers.get('cf-aig-cache-status');
        if (cacheStatus) {
            log(`Cache status for request: ${cacheStatus}`);
        }

        const data = await response.json();
        
        // The response is an array with one item since we sent one request
        const result = data[0];

        if (!result.success) {
            throw new Error(`Provider request failed: ${JSON.stringify(result.errors)}`);
        }

        // Add cache and provider information to response metadata
        const responseWithMetadata = {
            ...normalizeResponse(result.response, config.provider, model),
            _metadata: {
                provider: config.provider,
                cacheStatus,
                gateway: 'cloudflare',
                endpoint: config.endpoint
            }
        };

        return responseWithMetadata;
    } catch (error) {
        errorLog('Error in generateText:', error);
        
        // Enhance error with provider information
        error.provider = config.provider;
        error.model = model;
        error.gateway = 'cloudflare';
        
        throw error;
    }
}

/**
 * Normalizes responses from different providers into a consistent OpenAI-compatible format
 * 
 * @param {Object} data - Raw response data from the provider
 * @param {string} provider - Provider identifier (e.g., 'openai', 'anthropic', 'workers-ai')
 * @param {string} model - Model name used for the request
 * 
 * @returns {Object} Normalized response with OpenAI-compatible structure:
 *   - id: Unique identifier with pllns_ prefix
 *   - object: Always 'chat.completion'
 *   - created: Timestamp
 *   - model: Original model name
 *   - choices: Array of message choices with:
 *     - index: Choice index
 *     - message: { role: 'assistant', content: string }
 *     - finish_reason: Reason for completion
 *   - usage: Token usage statistics when available
 */
function normalizeResponse(data, provider, model) {
    // Initialize with OpenAI-compatible structure
    const normalized = {
        id: `pllns_${Date.now()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: model,
        choices: [],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    };

    // Handle different response formats from the universal endpoint
    switch (provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
            // These providers return OpenAI format through the gateway
            if (data.choices && Array.isArray(data.choices)) {
                return data;
            }
            // Fallback if response is not in expected format
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: typeof data === 'string' ? data : JSON.stringify(data)
                },
                finish_reason: 'stop'
            }];
            break;

        case 'workers-ai':
            // Workers AI might return string or object with response field
            const content = typeof data === 'string' ? data : data.response;
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: 'stop'
            }];
            break;

        case 'anthropic':
            // Anthropic response through gateway
            const text = data.content?.[0]?.text || data.text || data;
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: typeof text === 'string' ? text : JSON.stringify(text)
                },
                finish_reason: data.stop_reason || 'stop'
            }];
            if (data.usage) {
                normalized.usage = data.usage;
            }
            break;

        case 'google-ai-studio':
            // Google AI response through gateway
            const geminiContent = data.candidates?.[0]?.content?.parts?.[0]?.text 
                || data.text 
                || (typeof data === 'string' ? data : JSON.stringify(data));
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: geminiContent
                },
                finish_reason: 'stop'
            }];
            break;

        default:
            // Generic handler for unknown providers
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: typeof data === 'string' ? data : JSON.stringify(data)
                },
                finish_reason: 'stop'
            }];
    }

    return normalized;
}

export { generateText };
