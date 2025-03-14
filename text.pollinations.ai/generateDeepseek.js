import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';

dotenv.config();

// Default system prompts for DeepSeek models
const SYSTEM_PROMPTS = {
    'deepseek-coder': 'You are DeepSeek Coder, an AI programming assistant developed by DeepSeek. You are designed to help with coding tasks, debugging, and providing explanations about code. You excel at understanding and generating code in various programming languages.',
    'deepseek-chat': 'You are DeepSeek, a helpful AI assistant. You provide accurate, balanced information and can assist with a wide range of tasks while maintaining a respectful and supportive tone.'
};

// Default model to use if none specified
const DEFAULT_MODEL = 'deepseek-chat';

// Maximum token length for responses
const MAX_TOKENS = 8192;

// API endpoint
const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// Default options
const DEFAULT_OPTIONS = {
    model: DEFAULT_MODEL,
    maxTokens: MAX_TOKENS,
    temperature: 0.7,
    jsonMode: false,
    stream: false
};

// Model mapping (in this case, the model names are the same)
const MODEL_MAPPING = {
    'deepseek-chat': 'deepseek-chat',
    'deepseek-coder': 'deepseek-coder'
};

/**
 * Generates text using DeepSeek's API
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateDeepseek = createOpenAICompatibleClient({
    endpoint: API_ENDPOINT,
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        if (!process.env.DEEPSEEK_API_KEY) {
            return null;
        }
        return `Bearer ${process.env.DEEPSEEK_API_KEY}`;
    },
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'DeepSeek',
    supportsSystemMessages: false // DeepSeek doesn't support system messages
});
