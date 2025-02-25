import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';

dotenv.config();

// Model mapping for Cloudflare
const MODEL_MAPPING = {
    'llama': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'deepseek-r1': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    'llamaguard': '@hf/thebloke/llamaguard-7b-awq',
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'llama': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'llamalight': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'deepseek-r1': 'You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe.',
    'llamaguard': 'You are a content moderation assistant. Your task is to analyze the input and identify any harmful, unsafe, or inappropriate content.'
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'llama',
    temperature: 0.7,
    jsonMode: false
};

/**
 * Generates text using Cloudflare's AI API
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateTextCloudflare = createOpenAICompatibleClient({
    endpoint: (modelName) => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelName}`,
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        if (!process.env.CLOUDFLARE_AUTH_TOKEN) {
            return null;
        }
        return `Bearer ${process.env.CLOUDFLARE_AUTH_TOKEN}`;
    },
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'Cloudflare',
    
    // Custom response formatter for Cloudflare's unique response format (for non-streaming responses)
    formatResponse: (data, requestId, startTime, modelName, options) => {
        // If this is a streaming response with responseStream, return it as-is
        if (data && data.stream === true && data.responseStream) {
            // Add additional metadata to the streaming response
            return {
                ...data,
                id: `cloudflare-${requestId}`,
                created: Math.floor(startTime / 1000),
                model: modelName,
                isSSE: data.isSSE || false,
                // Keep the existing responseStream and other properties
            };
        }
        
        // Handle error responses
        if (data && data.error) {
            return {
                ...data,
                id: `cloudflare-${requestId}`,
                created: Math.floor(startTime / 1000),
                model: modelName
            };
        }
        
        // Handle normal responses
        return {
            choices: [{
                message: {
                    role: 'assistant',
                    content: data?.result?.response || 'No response from Cloudflare'
                },
                finish_reason: 'stop',
                index: 0
            }],
            id: `cloudflare-${requestId}`,
            object: 'chat.completion',
            model: modelName,
            created: Math.floor(startTime / 1000),
            usage: data?.result?.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    }
});
