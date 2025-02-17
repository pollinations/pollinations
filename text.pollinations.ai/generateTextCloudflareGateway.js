import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('pollinations:cloudflare-gateway');
const errorLog = debug('pollinations:error');

const BASE_URL = 'https://gateway.ai.cloudflare.com/v1/efdcb0933eaac64f27c0b295039b28f2/pollinations-text';

// Provider configurations
const PROVIDER_CONFIGS = {
    'openai': {
        provider: 'azure-openai',
        endpoint: 'chat/completions?api-version=2025-01-01-preview',
        authToken: process.env.AZURE_OPENAI_API_KEY,
        resourceName: 'pollinations',
        deploymentName: 'gpt-4o-mini',
    },
    'openai-large': {
        provider: 'azure-openai',
        endpoint: 'chat/completions?api-version=2025-01-01-preview',
        modelParam: 'model',
        authToken: process.env.AZURE_OPENAI_LARGE_API_KEY,
        resourceName: 'pollinations',
        deploymentName: 'gpt-4o'
    },
    'deepseek': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        authToken: process.env.DEEPSEEK_API_KEY,
    },
    'deepseek-reasoner': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        authToken: process.env.DEEPSEEK_API_KEY,   
    },
    'mistral': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        authToken: process.env.SCALEWAY_API_KEY,
        baseUrl: process.env.SCALEWAY_BASE_URL
    },
    'llama': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-70b-chat',
        modelParam: 'model',
        authToken: process.env.CLOUDFLARE_AUTH_TOKEN,
    },
    'llamalight': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llama-3.1-8b-instruct',
        modelParam: 'model',
        authToken: process.env.CLOUDFLARE_AUTH_TOKEN,
    },
    'llamaguard': {
        provider: 'workers-ai',
        endpoint: '@cf/meta/llamaguard-7b',
        modelParam: 'model',
        authToken: process.env.CLOUDFLARE_AUTH_TOKEN,
    },
    'claude-hybridspace': {
        provider: 'anthropic',
        endpoint: 'messages',
        modelParam: 'model',
        authToken: process.env.ANTHROPIC_API_KEY,
    },
    'gemini': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        authToken: process.env.GEMINI_API_KEY,
    },
    'gemini-thinking': {
        provider: 'openai',
        endpoint: 'chat/completions',
        modelParam: 'model',
        authToken: process.env.GEMINI_API_KEY,
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

    if (!config.authToken) {
        throw new Error(`Missing auth token for ${model}`);
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

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
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
