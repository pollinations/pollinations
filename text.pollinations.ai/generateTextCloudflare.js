import dotenv from 'dotenv';
import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';

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
        
        const response = await fetch(`${baseEndpoint}/${modelName}`, {
            method: 'POST',
            headers: config.headers,
            body
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.errors?.[0]?.message || `Cloudflare API error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Transform Cloudflare's response format to match the standard format
        return {
            choices: [{
                message: {
                    role: 'assistant',
                    content: data.result.response
                },
                finish_reason: 'stop'
            }],
            model: modelName,
            created: Date.now(),
            usage: data.result.usage || {}
        };
    }
});

export default generateTextCloudflare;
