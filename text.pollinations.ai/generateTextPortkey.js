import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';
import debug from 'debug';

dotenv.config();

const log = debug('pollinations:portkey');
const errorLog = debug('pollinations:portkey:error');

// Helper function to extract base URL from Azure endpoint
export function extractBaseUrl(endpoint) {
    if (!endpoint) return null;
    
    log('Extracting base URL from endpoint:', endpoint);
    
    // Extract the base URL (e.g., https://pollinations4490940554.openai.azure.com)
    const match = endpoint.match(/(https:\/\/[^\/]+)/);
    const result = match ? match[1] : endpoint;
    log('Extracted base URL:', result);
    
    // Validate the extracted URL
    if (!result || result === 'undefined' || result === undefined) {
        errorLog('Invalid Azure OpenAI endpoint:', endpoint);
        return null;
    }
    
    return result;
}

// Helper function to extract resource name from Azure endpoint
export function extractResourceName(endpoint) {
    if (endpoint === undefined || endpoint === null) return null;
    log('Extracting resource name from endpoint:', endpoint);
    
    // Extract resource name (e.g., pollinations4490940554 from https://pollinations4490940554.openai.azure.com)
    const match = endpoint.match(/https:\/\/([^\.]+)\.openai\.azure\.com/);
    const result = match ? match[1] : null;
    log('Extracted resource name:', result);
    
    // If we can't extract the resource name, use a default value
    if (!result || result === 'undefined' || result === undefined) {
        log('Using default resource name: pollinations');
        return 'pollinations';
    }
    
    return result;
}

// Extract deployment names from endpoints
export function extractDeploymentName(endpoint) {
    if (!endpoint) return null;
    log('Extracting deployment name from endpoint:', endpoint);
    
    // Extract deployment name (e.g., gpt-4o-mini from .../deployments/gpt-4o-mini/...)
    const match = endpoint.match(/\/deployments\/([^\/]+)/);
    log('Extracted deployment name:', match ? match[1] : null);
    return match ? match[1] : null;
}

// Extract API version from endpoints
export function extractApiVersion(endpoint) {
    if (!endpoint) return process.env.OPENAI_API_VERSION || '2024-08-01-preview';
    log('Extracting API version from endpoint:', endpoint);
    
    // Extract API version (e.g., 2024-08-01-preview from ...?api-version=2024-08-01-preview)
    const match = endpoint.match(/api-version=([^&]+)/);
    const version = match ? match[1] : process.env.OPENAI_API_VERSION || '2024-08-01-preview';
    log('Extracted API version:', version);
    return version;
}

// Model mapping for Portkey
const MODEL_MAPPING = {
    // Azure OpenAI models
    'openai': 'gpt-4o-mini',       // Maps to portkeyConfig['gpt-4o-mini']
    'openai-large': 'gpt-4o',      // Maps to portkeyConfig['gpt-4o']
    'openai-reasoning': 'o1-mini', // Maps to portkeyConfig['o1-mini'],
    // Cloudflare models
    'llama': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'deepseek-r1': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    'llamaguard': '@hf/thebloke/llamaguard-7b-awq',
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'openai': 'You are a helpful, knowledgeable assistant.',
    'openai-large': 'You are a helpful, knowledgeable assistant.',
    'llama': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'llamalight': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'deepseek-r1': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'llamaguard': 'You are a content moderation assistant. Your task is to analyze the input and identify any harmful, unsafe, or inappropriate content.'
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'openai',
    temperature: 0.7,
    jsonMode: false
};

/**
 * Generates text using a local Portkey gateway with OpenAI-compatible endpoints
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */

// Base configurations for different providers (without x-portkey- prefix)
const baseAzureConfig = {
    provider: 'azure-openai',
    retry: '3',
};

// Unified flat Portkey configuration for all providers and models
export const portkeyConfig = {
    // Azure OpenAI model configurations
    'gpt-4o-mini': {
        ...baseAzureConfig,
        'azure-api-key': process.env.AZURE_OPENAI_API_KEY,
        'azure-resource-name': extractResourceName(process.env.AZURE_OPENAI_ENDPOINT),
        'azure-deployment-id': 'gpt-4o-mini',
        'azure-api-version': extractApiVersion(process.env.AZURE_OPENAI_ENDPOINT),
        'azure-model-name':  'gpt-4o-mini',
        authKey: process.env.AZURE_OPENAI_API_KEY, // For Authorization header
    },
    'gpt-4o': {
        ...baseAzureConfig,
        'azure-api-key': process.env.AZURE_OPENAI_LARGE_API_KEY,
        'azure-resource-name': extractResourceName(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        'azure-deployment-id': 'gpt-4o',
        'azure-api-version': extractApiVersion(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        'azure-model-name': 'gpt-4o',
        authKey: process.env.AZURE_OPENAI_LARGE_API_KEY, // For Authorization header
    },
    'o1-mini': {
        ...baseAzureConfig,
        'azure-api-key': process.env.AZURE_O1MINI_API_KEY,
        'azure-resource-name': extractResourceName(process.env.AZURE_O1MINI_ENDPOINT),
        'azure-deployment-id': extractDeploymentName(process.env.AZURE_O1MINI_ENDPOINT) || 'o1-mini',
        'azure-api-version': extractApiVersion(process.env.AZURE_O1MINI_ENDPOINT),
        'azure-model-name': extractDeploymentName(process.env.AZURE_O1MINI_ENDPOINT) || 'o1-mini',
        authKey: process.env.AZURE_O1MINI_API_KEY, // For Authorization header
    },
    // Cloudflare model configurations
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { 
        provider: 'openai',
        'custom-host': `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        authKey: process.env.CLOUDFLARE_AUTH_TOKEN,
    },
    // Add other Cloudflare models directly
    '@cf/meta/llama-3.1-8b-instruct': {
        provider: 'openai',
        'custom-host': `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        authKey: process.env.CLOUDFLARE_AUTH_TOKEN,
    },
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': {
        provider: 'openai',
        'custom-host': `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        authKey: process.env.CLOUDFLARE_AUTH_TOKEN
    },
    '@hf/thebloke/llamaguard-7b-awq': {
        provider: 'openai',
        'custom-host': `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        authKey: process.env.CLOUDFLARE_AUTH_TOKEN
    }
};

// Log the configuration
log('Azure configuration:');
const azureModels = Object.entries(portkeyConfig).filter(([_, config]) => config.provider === 'azure-openai');
for (const [model, config] of azureModels) {
    log(`Model ${model}:`, JSON.stringify(config, null, 2));
}

log('Cloudflare configuration:');
const cloudflareModels = Object.entries(portkeyConfig).filter(([_, config]) => config.provider === 'openai');
for (const [model, config] of cloudflareModels) {
    log(`Model ${model}:`, JSON.stringify({
        ...config,
        'cloudflare-account-id': config['cloudflare-account-id'] ? '***' : undefined,
        'cloudflare-auth-token': config['cloudflare-auth-token'] ? '***' : undefined
    }, null, 2));
}

function countMessageCharacters(messages) {
    return messages.reduce((total, message) => {
        if (typeof message.content === 'string') {
            return total + message.content.length;
        }
        if (Array.isArray(message.content)) {
            return total + message.content.reduce((sum, part) => {
                if (part.type === 'text') {
                    return sum + part.text.length;
                }
                return sum;
            }, 0);
        }
        return total;
    }, 0);
}

/**
 * Generates text using a local Portkey gateway with Azure OpenAI models
 */
export const generateTextPortkey = createOpenAICompatibleClient({
    // Use Portkey API Gateway URL from .env with fallback to localhost
    endpoint: () => `${process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'}/v1/chat/completions`,
    
    // Auth header configuration
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        // Use the actual Portkey API key from environment variables
        return `Bearer ${process.env.PORTKEY_API_KEY || 'pk-123456789'}`;
    },
    
    // Additional headers will be dynamically set in transformRequest
    additionalHeaders: {},
    
    // Transform request to add Azure-specific headers based on the model
    transformRequest: (requestBody) => {
        try {
            // Get the model name from the request (already mapped by genericOpenAIClient)
            const modelName = requestBody.model; // This is already mapped by genericOpenAIClient

            // Check character limit
            const MAX_CHARS = 512000;
            const totalChars = countMessageCharacters(requestBody.messages);
            
            if (totalChars > MAX_CHARS) {
                errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
                throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
            }

            // Get the model configuration object
            const config = portkeyConfig[modelName];

            if (!config) {
                errorLog(`No configuration found for model: ${modelName}`);
                throw new Error(`No configuration found for model: ${modelName}. Available configs: ${Object.keys(portkeyConfig).join(', ')}`);
            }

            log('Processing request for model:', modelName, 'with provider:', config.provider);

            // Generate headers by prefixing config properties with 'x-portkey-'
            const additionalHeaders = {};
            for (const [key, value] of Object.entries(config)) {
                // Skip special properties that aren't headers
                if (key === 'removeSeed' || key === 'authKey') continue;
                
                additionalHeaders[`x-portkey-${key}`] = value;
            }

            // Add Authorization header if needed
            if (config.authKey) {
                additionalHeaders['Authorization'] = `Bearer ${config.authKey}`;
            }
            
            // Set the headers as a property on the request object that will be used by genericOpenAIClient
            requestBody._additionalHeaders = additionalHeaders;
            log('Added provider-specific headers:', JSON.stringify(requestBody._additionalHeaders, null, 2));
            
            return requestBody;
        } catch (error) {
            errorLog('Error in request transformation:', error);
            throw error;
        }
    },
    
    // Model mapping, system prompts, and default options
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'Portkey Gateway'
});