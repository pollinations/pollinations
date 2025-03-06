import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';

dotenv.config();

// Model mapping for Gemini
const MODEL_MAPPING = {
    'gemini': 'gemini-2.0-flash-exp',
    'gemini-thinking': 'gemini-2.0-flash-thinking-exp-01-21'
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'gemini': 'You are Gemini, a helpful and versatile AI assistant built by Google. You provide accurate, balanced information and can assist with a wide range of tasks while maintaining a respectful and supportive tone.',
    'gemini-thinking': 'You are Gemini, a helpful and versatile AI assistant built by Google. You provide accurate, balanced information and can assist with a wide range of tasks while maintaining a respectful and supportive tone. When appropriate, show your reasoning step by step.'
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'gemini',
    temperature: 0.7,
    jsonMode: false,
    n: 1
};

// API endpoint
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * Generates text using Google's Gemini API
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateTextGemini = createOpenAICompatibleClient({
    endpoint: API_ENDPOINT,
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        if (!process.env.GEMINI_API_KEY) {
            return null;
        }
        return `Bearer ${process.env.GEMINI_API_KEY}`;
    },
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'Gemini'
});
