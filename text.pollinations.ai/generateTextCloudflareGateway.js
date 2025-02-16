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
        provider: 'azure-openai',
        endpoint: 'chat/completions?api-version=2025-01-01-preview',
        environmentKey: 'AZURE_OPENAI_API_KEY',
        resourceName: 'pollinations',
        deploymentName: 'gpt-4o-mini',
        // apiVersion: '2024-08-01-preview'
    },
    'openai-large': {
        provider: 'azure-openai',
        endpoint: 'chat/completions?api-version=2025-01-01-preview',
        modelParam: 'model',
        environmentKey: 'AZURE_OPENAI_LARGE_API_KEY',
        resourceName: 'pollinations',
        deploymentName: 'gpt-4o'
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
        throw new Error(`Unknown model: ${model}`);
    }

    const apiKey = process.env[config.environmentKey];
    if (!apiKey) {
        throw new Error(`Missing API key for ${model} (${config.environmentKey})`);
    }

    const requestBody = {
        messages,
        temperature: options.temperature,
        stream: options.stream,
        max_tokens: options.max_tokens,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined
    };

    const url = config.provider === 'azure-openai' 
        ? `${BASE_URL}/${config.provider}/${config.resourceName}/${config.deploymentName}/${config.endpoint}`
        : `${BASE_URL}/${config.provider}/${config.endpoint}`;
        
    log('Request URL:', url);
    log('Request body:', requestBody);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json();
        errorLog('Error from AI Gateway:', error);
        
        // Extract error details
        const errorMessage = error.error?.message || JSON.stringify(error.error) || 'Unknown error';
        const errorCode = error.error?.code || response.status;
        const errorType = error.error?.type || 'gateway_error';
        
        // Construct detailed error object
        const enhancedError = new Error(`AI Gateway error: ${errorMessage}`);
        enhancedError.code = errorCode;
        enhancedError.type = errorType;
        enhancedError.provider = config.provider;
        enhancedError.model = model;
        enhancedError.gateway = 'cloudflare';
        enhancedError.raw = error;
        
        throw enhancedError;
    }

    if (options.stream) {
        return response;
    }

    const data = await response.json();
    return data;
}

export { generateText };
