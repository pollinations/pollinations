import { createTextGenerator } from './generateTextBase.js';
import dotenv from 'dotenv';
import debug from 'debug';

dotenv.config();
const log = debug('pollinations:openrouter');

// Model mapping for OpenRouter
const MODEL_MAPPING = {
    'claude-email': 'anthropic/claude-3-sonnet',  // Map to Claude 3
    'deepseek': 'deepseek/deepseek-chat',
    'qwen': 'qwen/qwen1.5-72b',
    'qwen-coder': 'qwen/qwen1.5-72b-chat',
    'llama': 'meta-llama/llama-3-70b-chat',
    'mistral': 'mistralai/mistral-7b-instruct',
    'mistral-large': 'mistralai/mistral-large',
    'llamalight': 'meta-llama/llama-3-8b-chat'
};

export const generateTextOpenRouter = createTextGenerator({
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: MODEL_MAPPING['deepseek'],
    modelMapping: MODEL_MAPPING,
    customHeaders: {
        'HTTP-Referer': 'https://pollinations.ai',
        'X-Title': 'Pollinations.AI'
    }
});
