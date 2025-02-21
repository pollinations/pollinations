import { Portkey } from 'portkey-ai';
import debug from 'debug';
import dotenv from 'dotenv';

dotenv.config();

const log = debug('pollinations:portkey');
const errorLog = debug('pollinations:error');

// Provider configurations
const PROVIDER_CONFIGS = {
    'openai': {
        provider: 'azure-openai',
        api_key: process.env.AZURE_OPENAI_API_KEY,
        model: 'gpt-4o-mini',
    },
    'openai-large': {
        provider: 'azure-openai',
        api_key: process.env.AZURE_OPENAI_LARGE_API_KEY,
        model: 'gpt-4o',
    }
};

/**
 * Generates text using various AI models through Portkey Gateway
 * 
 * @param {Array<Object>} messages - Array of message objects with role and content
 * @param {Object} options - Configuration options
 * @param {string} [options.model='openai'] - Model identifier (e.g., 'openai', 'openai-large')
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
        
        // Create Portkey client with provider config
        const client = new Portkey({
            baseURL: 'https://api.portkey.ai/v1',
            apiKey: process.env.PORTKEY_API_KEY,
        });

        // Create completion request with headers
        const requestConfig = {
            headers: {
                'Content-Type': 'application/json',
            },
            config: {
                provider: config.provider,
                api_key: config.api_key,
                config: {
                    model: config.model,
                }
            }
        };

        log('Request Config:', requestConfig);

        // Create completion request
        const response = await client.chat.completions.create({
            messages,
            temperature,
            stream,
        }, requestConfig);

        log('Response:', response);
        return response;
    } catch (error) {
        errorLog('Error generating text:', error);
        throw new Error(`Error generating text with ${model}: ${error.message}`);
    }
}

export { generateText };
