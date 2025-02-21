import { completion } from 'litellm';
import debug from 'debug';

const log = debug('pollinations:litellm');
const errorLog = debug('pollinations:error');

// Provider configurations
const PROVIDER_CONFIGS = {
    'openai': {
        model: 'openai/gpt-4',
        api_base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
        api_key: process.env.AZURE_OPENAI_API_KEY,
    },
    'openai-large': {
        model: 'openai/gpt-4-turbo-preview',
        api_base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
        api_key: process.env.AZURE_OPENAI_LARGE_API_KEY,
    },
    'deepseek': {
        model: 'openai/deepseek-chat',
        api_base: process.env.DEEPSEEK_API_BASE,
        api_key: process.env.DEEPSEEK_API_KEY,
    },
    'deepseek-reasoner': {
        model: 'openai/deepseek-reasoner',
        api_base: process.env.DEEPSEEK_API_BASE,
        api_key: process.env.DEEPSEEK_API_KEY,
    },
    'mistral': {
        model: 'openai/mistral-large',
        api_base: process.env.SCALEWAY_BASE_URL,
        api_key: process.env.SCALEWAY_API_KEY,
    },
    'llama': {
        model: 'openai/llama-70b',
        api_base: process.env.LLAMA_API_BASE,
        api_key: process.env.LLAMA_API_KEY,
    },
    'llamalight': {
        model: 'openai/llama-13b',
        api_base: process.env.LLAMA_API_BASE,
        api_key: process.env.LLAMA_API_KEY,
    }
};

/**
 * Generates text using various AI models through LiteLLM
 * 
 * @param {Array<Object>} messages - Array of message objects with role and content
 * @param {Object} options - Configuration options
 * @param {string} [options.model='openai'] - Model identifier (e.g., 'openai', 'mistral', 'llama')
 * @param {number} [options.temperature=0.7] - Temperature for response generation
 * @param {boolean} [options.stream=false] - Whether to stream the response
 * 
 * @returns {Promise<Object>} Response object with standard OpenAI-compatible response fields
 * @throws {Error} With enhanced error information
 */
async function generateText(messages, options = {}) {
    const {
        model = 'openai',
        temperature = 0.7,
        stream = false,
    } = options;

    const config = PROVIDER_CONFIGS[model];
    if (!config) {
        throw new Error(`Unknown model: ${model}`);
    }

    try {
        log('Generating text with model:', model);
        log('Messages:', messages);
        
        const response = await completion({
            ...config,
            messages,
            temperature,
            stream,
        });

        log('Response:', response);
        return response;
    } catch (error) {
        errorLog('Error generating text:', error);
        throw new Error(`Error generating text with ${model}: ${error.message}`);
    }
}

export { generateText };
