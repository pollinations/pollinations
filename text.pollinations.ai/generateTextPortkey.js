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
    'openai': 'gpt-4o-mini',       // Maps to azureConfig['gpt-4o-mini']
    'openai-large': 'gpt-4o',      // Maps to azureConfig['gpt-4o']
    'openai-reasoning': 'o1-mini', // Maps to azureConfig['o1-mini']
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'openai': 'You are a helpful, knowledgeable assistant.',
    'openai-large': 'You are a helpful, knowledgeable assistant.',
    'openai-reasoning': 'You are a helpful, knowledgeable assistant.',
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

// Configure Azure endpoints and API keys for each model
export const azureConfig = {
    'gpt-4o-mini': {
        baseUrl: extractBaseUrl(process.env.AZURE_OPENAI_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_OPENAI_ENDPOINT),
        deploymentName: extractDeploymentName(process.env.AZURE_OPENAI_ENDPOINT) || 'gpt-4o-mini',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        apiVersion: extractApiVersion(process.env.AZURE_OPENAI_ENDPOINT),
    },
    'gpt-4o': {
        baseUrl: extractBaseUrl(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        deploymentName: extractDeploymentName(process.env.AZURE_OPENAI_LARGE_ENDPOINT) || 'gpt-4o',
        apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
        apiVersion: extractApiVersion(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
    },
    'o1-mini': {
        baseUrl: extractBaseUrl(process.env.AZURE_O1MINI_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_O1MINI_ENDPOINT),
        deploymentName: extractDeploymentName(process.env.AZURE_O1MINI_ENDPOINT) || 'o1-mini',
        apiKey: process.env.AZURE_O1MINI_API_KEY,
        apiVersion: extractApiVersion(process.env.AZURE_O1MINI_ENDPOINT),
    },
};

// Log the configuration
log('Azure configuration:');
for (const [model, config] of Object.entries(azureConfig)) {
    log(`Model ${model}:`, JSON.stringify(config, null, 2));
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
            // Get the model name from the request
            const modelName = requestBody.model; // This is already mapped by genericOpenAIClient
            // Find the correct Azure configuration for this model
            const modelConfig = azureConfig[modelName];
            
            if (!modelConfig) {
                errorLog(`No Azure configuration found for model: ${modelName}`);
                throw new Error(`No Azure configuration found for model: ${modelName}. Available configs: ${Object.keys(azureConfig).join(', ')}`);
            }
            
            log('Processing request for model:', modelName, 'with config:', JSON.stringify(modelConfig, null, 2));
    
            // Removed validation logic for missing parameters - let backend handle errors
            
            // Check character limit
            const MAX_CHARS = 512000;
            const totalChars = countMessageCharacters(requestBody.messages);
            
            if (totalChars > MAX_CHARS) {
                errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
                throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
            }

            // Set the headers as a property on the request object that will be used by genericOpenAIClient
            // to set the actual HTTP headers
            requestBody._additionalHeaders = {
                'x-portkey-provider': 'azure-openai',
                'x-portkey-retry': '3',
                'x-portkey-azure-api-key': modelConfig.apiKey,
                'x-portkey-azure-resource-name': modelConfig.resourceName,
                'x-portkey-azure-deployment-id': modelConfig.deploymentName,
                'x-portkey-azure-api-version': modelConfig.apiVersion || '2024-08-01-preview',
                'x-portkey-azure-model-name': modelConfig.deploymentName,
                // Add Authorization header for proper Azure OpenAI authentication
                'Authorization': `Bearer ${modelConfig.apiKey}`
            };
            log('Added Azure-specific headers:', JSON.stringify(requestBody._additionalHeaders, null, 2));
            
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
    providerName: 'Azure OpenAI via Portkey'
});