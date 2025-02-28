import dotenv from 'dotenv';
import debug from 'debug';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';
import { spamTheSpammersPrompt } from './pollinationsPrompt.js';

const log = debug('pollinations:openai');
const errorLog = debug('pollinations:openai:error');

dotenv.config();

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

// Model mapping for Azure OpenAI models via Portkey
const MODEL_MAPPING = {
    "openai": "gpt-4o-mini",
    "openai-reasoning": "o1-mini",
    "openai-large": "gpt-4o",
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'gpt-4o-mini': 'You are a helpful, knowledgeable assistant.',
    'o1-mini': 'You are a helpful, knowledgeable assistant.',
    'gpt-4o': 'You are a helpful, knowledgeable assistant.',
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    jsonMode: false
};

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

// Extract deployment names from endpoints
export function extractDeploymentName(endpoint) {
    if (!endpoint) return null;
    log('Extracting deployment name from endpoint:', endpoint);
    
    // Extract deployment name (e.g., gpt-4o-mini from .../deployments/gpt-4o-mini/...)
    const match = endpoint.match(/\/deployments\/([^\/]+)/);
    log('Extracted deployment name:', match ? match[1] : null);
    return match ? match[1] : null;
}

// Configure Portkey endpoints and API keys for each Azure model
export const portkeyConfig = {
    'gpt-4o-mini': {
        baseUrl: extractBaseUrl(process.env.AZURE_OPENAI_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_OPENAI_ENDPOINT),
        deploymentName: extractDeploymentName(process.env.AZURE_OPENAI_ENDPOINT) || 'gpt-4o-mini',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    },
    'gpt-4o': {
        baseUrl: extractBaseUrl(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_OPENAI_LARGE_ENDPOINT),
        deploymentName: extractDeploymentName(process.env.AZURE_OPENAI_LARGE_ENDPOINT) || 'gpt-4o',
        apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
    },
    'o1-mini': {
        baseUrl: extractBaseUrl(process.env.AZURE_O1MINI_ENDPOINT),
        resourceName: extractResourceName(process.env.AZURE_O1MINI_ENDPOINT),
        apiKey: process.env.AZURE_O1MINI_API_KEY,
        deploymentName: extractDeploymentName(process.env.AZURE_O1MINI_ENDPOINT) || 'o1-mini',
    },
};


// Log the configuration
log('Portkey configuration:');
for (const [model, config] of Object.entries(portkeyConfig)) {
    log(`Model ${model}:`, JSON.stringify(config, null, 2));
}

// Create the OpenAI-compatible client using Portkey
export const generateText = createOpenAICompatibleClient({
    // Use Portkey gateway endpoint
    endpoint: () => 'http://localhost:8787/v1/chat/completions',
    
    // Auth header configuration
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        // Use a placeholder API key - Portkey will use the API key from the headers
        return `Bearer pk-123456789`;  // This is a placeholder, Portkey will use our Azure keys
    },
    
    // Additional headers for Portkey configuration
    additionalHeaders: {
        'x-portkey-provider': 'azure-openai',
        'x-portkey-retry': '3',
    },
    
    // Transform request to add Azure-specific headers based on the model
    transformRequest: (requestBody) => {
        try {
            // Get the model name from the request
            const modelName = requestBody.model;
            const modelConfig = portkeyConfig[modelName] || portkeyConfig['gpt-4o-mini'];
            
            log('Processing request for model:', modelName, 'with config:', JSON.stringify(modelConfig, null, 2));
    
            // Validate Azure configuration
            if (!modelConfig.baseUrl || !modelConfig.apiKey || !modelConfig.deploymentName) {
                const missingParams = [];
                if (!modelConfig.baseUrl) missingParams.push('Azure OpenAI endpoint URL');
                if (!modelConfig.apiKey) missingParams.push('Azure OpenAI API key');
                if (!modelConfig.deploymentName) missingParams.push('Azure OpenAI deployment name');
                
                const errorMessage = `Azure OpenAI configuration is incomplete: ${missingParams.join(', ')} not configured`;
                errorLog(errorMessage);
                
                // Instead of throwing an error, use OpenAI directly as a fallback
                log('Falling back to OpenAI API');
                requestBody.headers = {
                    ...requestBody.headers,
                    'x-portkey-provider': 'openai',
                    'x-portkey-openai-api-key': process.env.OPENAI_API_KEY || ''
                };
                
                return {
                    ...requestBody,
                    model: 'gpt-3.5-turbo' // Use a standard OpenAI model as fallback
                };
            }
            
            // Add Azure-specific headers
            requestBody.headers = {
                ...requestBody.headers,
                'x-portkey-azure-api-key': modelConfig.apiKey || '',
                'x-portkey-azure-resource-name': modelConfig.resourceName || '',
                'x-portkey-azure-deployment-id': modelConfig.deploymentName || '',
                'x-portkey-azure-api-version': process.env.OPENAI_API_VERSION || '2024-08-01-preview',
                'x-portkey-azure-model-name': modelConfig.deploymentName || ''
            };
            
            log('Added Azure-specific headers:', JSON.stringify(requestBody.headers, null, 2));
        } catch (error) {
            // If anything goes wrong, fall back to OpenAI
            errorLog('Error in Azure OpenAI configuration, falling back to OpenAI:', error.message);
            requestBody.headers = {
                ...requestBody.headers,
                'x-portkey-provider': 'openai',
                'x-portkey-openai-api-key': process.env.OPENAI_API_KEY || ''
            };
            
            return {
                ...requestBody,
                model: 'gpt-3.5-turbo' // Use a standard OpenAI model as fallback
            };
        }
        
        // Check character limit
        const MAX_CHARS = 512000;
        const totalChars = countMessageCharacters(requestBody.messages);
        
        if (totalChars > MAX_CHARS) {
            errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
            throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
        }
        
        // Handle system message
        let processedMessages = [...requestBody.messages];
        
        if (!hasSystemMessage(processedMessages)) {
            const systemContent = requestBody.response_format?.type === 'json_object'
                ? 'Respond in simple json format'
                : spamTheSpammersPrompt();
                
            processedMessages = [{ role: 'system', content: systemContent }, ...processedMessages];
        } else if (requestBody.response_format?.type === 'json_object') {
            const systemMessage = processedMessages.find(m => m.role === 'system');
            if (!containsJSON(systemMessage.content)) {
                systemMessage.content += ' Respond with JSON.';
            }
        }
        
        // Special handling for o1-mini model
        if (requestBody.model === 'o1-mini') {
            processedMessages = processedMessages.map(message => {
                if (message.role === 'system') {
                    return { ...message, role: 'user' };
                }
                return message;
            });
        }
        
        return {
            ...requestBody,
            messages: processedMessages
        };
    },
    
    // Model mapping, system prompts, and default options
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'Azure OpenAI via Portkey'
});

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

function containsJSON(text) {
    return text.toLowerCase().includes('json');
}
