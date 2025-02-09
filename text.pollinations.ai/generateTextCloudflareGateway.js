import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('pollinations:cloudflare-gateway');
const errorLog = debug('pollinations:error');

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_GATEWAY_ID = process.env.CLOUDFLARE_GATEWAY_ID;
const CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;

const BASE_URL = `https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CLOUDFLARE_GATEWAY_ID}`;

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

// Map of model names to their provider endpoints
const MODEL_PROVIDERS = {
    'openai': 'openai',
    'openai-large': 'openai',
    'deepseek': 'deepseek',
    'deepseek-reasoner': 'deepseek',
    'mistral': 'mistral',
    'llama': 'workers-ai',
    'llamalight': 'workers-ai',
    'llamaguard': 'workers-ai',
    'claude-hybridspace': 'anthropic',
    'gemini': 'google-ai-studio',
    'gemini-thinking': 'google-ai-studio'
};

// Map of model names to their actual model IDs on respective providers
const MODEL_IDS = {
    'openai': 'gpt-4',
    'openai-large': 'gpt-4',
    'deepseek': 'deepseek-chat',
    'deepseek-reasoner': 'deepseek-reasoner',
    'mistral': 'mistral-large-latest',
    'llama': '@cf/meta/llama-3.1-70b-chat',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'llamaguard': '@cf/meta/llamaguard-7b',
    'claude-hybridspace': 'claude-3-haiku-20240307',
    'gemini': 'gemini-pro',
    'gemini-thinking': 'gemini-pro'
};

/**
 * Generates text using various AI models through Cloudflare's AI Gateway
 * 
 * @param {Array<Object>} messages - Array of message objects with role and content
 * @param {Object} options - Configuration options
 * @param {string} [options.model='openai'] - Model identifier (e.g., 'openai', 'mistral', 'llama')
 * @param {number} [options.temperature=0.7] - Temperature for response generation
 * @param {boolean} [options.stream=false] - Whether to stream the response
 * @param {number} [options.cacheTtl=3600] - Cache TTL in seconds (ignored if streaming)
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
    const provider = MODEL_PROVIDERS[model];
    const modelId = MODEL_IDS[model];

    if (!provider || !modelId) {
        throw new Error(`Unsupported model: ${model}`);
    }

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_GATEWAY_ID || !CLOUDFLARE_AUTH_TOKEN) {
        throw new Error('Missing required Cloudflare configuration');
    }

    const endpoint = `${BASE_URL}/${provider}`;
    let url;
    let body;

    // Configure request based on provider
    switch (provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
            url = `${endpoint}/v1/chat/completions`;
            body = {
                model: modelId,
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'workers-ai':
            url = `${endpoint}/${modelId}`;
            body = {
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'anthropic':
            url = `${endpoint}/v1/messages`;
            body = {
                model: modelId,
                messages,
                max_tokens: 1024,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'google-ai-studio':
            url = `${endpoint}/v1/models/${modelId}:generateContent`;
            body = {
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
            throw new Error(`Unsupported provider: ${provider}`);
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CLOUDFLARE_AUTH_TOKEN}`
        };

        // Add caching headers if not streaming
        if (!options.stream) {
            headers['cf-aig-cache-ttl'] = options.cacheTtl || '3600';  // Default 1 hour cache
            if (options.skipCache) {
                headers['cf-aig-skip-cache'] = 'true';
            }
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
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

        // Add cache and provider information to response metadata
        const responseWithMetadata = {
            ...normalizeResponse(data, provider, model),
            _metadata: {
                provider,
                cacheStatus,
                gateway: 'cloudflare',
                modelId: modelId
            }
        };

        return responseWithMetadata;
    } catch (error) {
        errorLog('Error in generateText:', error);
        
        // Enhance error with provider information
        error.provider = provider;
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

    switch (provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
            // These providers already return OpenAI-compatible format:
            // {
            //   choices: [{ message: { role: 'assistant', content: string } }],
            //   usage: { prompt_tokens, completion_tokens, total_tokens }
            // }
            return data;

        case 'workers-ai':
            // Workers AI returns simpler format:
            // { response: string }
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.response
                },
                finish_reason: 'stop'
            }];
            break;

        case 'anthropic':
            // Anthropic Claude returns:
            // {
            //   content: [{ text: string }],
            //   stop_reason: string,
            //   usage: { input_tokens, output_tokens }
            // }
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.content[0].text
                },
                finish_reason: data.stop_reason || 'stop'
            }];
            if (data.usage) {
                normalized.usage = data.usage;
            }
            break;

        case 'google-ai-studio':
            // Google AI returns:
            // {
            //   candidates: [{
            //     content: { parts: [{ text: string }] }
            //   }]
            // }
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.candidates[0].content.parts[0].text
                },
                finish_reason: 'stop'
            }];
            break;
    }

    return normalized;
}

export { generateText };
