import dotenv from 'dotenv';
import debug from 'debug';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';

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

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'claude-email': 'You are Claude, a helpful AI assistant created by Anthropic. You excel at drafting professional emails and communications.',
    'deepseek': 'You are DeepSeek, a helpful AI assistant. You provide accurate and thoughtful responses.',
    'qwen': 'You are Qwen, a helpful AI assistant developed by Alibaba Cloud. You provide accurate and thoughtful responses.',
    'qwen-coder': 'You are Qwen, an expert coding assistant with deep knowledge of programming languages, software architecture, and best practices.',
    'llama': 'You are Llama, a helpful AI assistant developed by Meta. You provide accurate and thoughtful responses.',
    'mistral': 'You are Mistral, a helpful AI assistant. You provide accurate and thoughtful responses.',
    'mistral-large': 'You are Mistral Large, a powerful AI assistant. You provide accurate, detailed, and thoughtful responses.',
    'llamalight': 'You are Llama, a helpful AI assistant developed by Meta. You provide accurate and thoughtful responses.'
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'deepseek',
    temperature: 0.7,
    maxTokens: 4096,
    jsonMode: false
};

/**
 * Generates text using OpenRouter API (gateway to multiple models)
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateTextOpenRouter = createOpenAICompatibleClient({
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        if (!process.env.OPENROUTER_API_KEY) {
            return null;
        }
        return `Bearer ${process.env.OPENROUTER_API_KEY}`;
    },
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'OpenRouter',
    
    // Add additional headers specific to OpenRouter
    additionalHeaders: {
        'HTTP-Referer': 'https://pollinations.ai',
        'X-Title': 'Pollinations.AI'
    }
});
