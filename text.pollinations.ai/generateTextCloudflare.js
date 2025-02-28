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
 * Custom request transformer for Cloudflare
 * Removes the seed parameter which is not supported by Cloudflare
 */
function transformCloudflareRequest(requestBody) {
    // Create a new object without the seed property
    const { seed, ...restOfBody } = requestBody;
    return restOfBody;
}

/**
 * Generates text using Cloudflare's AI API with OpenAI-compatible endpoints
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateTextCloudflare = createOpenAICompatibleClient({
    endpoint: (modelName) => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
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
    transformRequest: transformCloudflareRequest
});
