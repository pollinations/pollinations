import dotenv from 'dotenv';
import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import debug from 'debug';

dotenv.config();

// Model mapping for Cloudflare
const MODEL_MAPPING = {
    'llama': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'deepseek-r1': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
};

// Message preprocessor for Cloudflare
const preprocessMessages = (messages, options) => {
    // Add system message if not present
    messages = ensureSystemMessage(messages, 'You are a helpful AI assistant.');
    
    // Validate and normalize messages
    return messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content || ''
    }));
};

// Create Cloudflare text generator instance
const generateTextCloudflare = createTextGenerator({
    endpoint: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run`,
    apiKey: process.env.CLOUDFLARE_AUTH_TOKEN,
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    modelMapping: MODEL_MAPPING,
    preprocessor: preprocessMessages,
    // Custom API call to handle Cloudflare's specific endpoint structure
    customApiCall: async (baseEndpoint, config) => {
        const { body } = config;
        const requestBody = JSON.parse(body);
        const modelName = requestBody.model;
        
        // Add debug logging
        const log = debug('pollinations:cloudflare');
        log(`Making request to Cloudflare AI API:`, {
            endpoint: `${baseEndpoint}/${modelName}`,
            model: modelName,
            headers: config.headers
        });

        try {
            const response = await fetch(`${baseEndpoint}/${modelName}`, {
                method: 'POST',
                headers: {
                    ...config.headers,
                    'Content-Type': 'application/json'
                },
                body
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                log('Cloudflare API error:', errorData);
                throw new Error(errorData.errors?.[0]?.message || `Cloudflare API error (${response.status}): ${response.statusText}`);
            }

            const data = await response.json();
            return {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: data.result?.response || ''
                    },
                    finish_reason: 'stop'
                }],
                model: modelName,
                created: Date.now()
            };
        } catch (error) {
            log('Error in Cloudflare API call:', error);
            throw error;
        }
    }
});

export default generateTextCloudflare;
