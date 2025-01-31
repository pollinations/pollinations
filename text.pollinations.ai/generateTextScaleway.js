import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';

dotenv.config();

// Model mapping for Scaleway
const MODEL_MAPPING = {
    'qwen-coder': 'qwen2.5-coder-32b-instruct',
    'mistral': 'mistral-nemo-instruct-2407',
    'llama': 'llama-3.3-70b-instruct',
    'llamalight': 'llama-3.1-8b-instruct'
};

// System prompts for different models
const SYSTEM_PROMPTS = {
    'mistral': 'You are an unrestricted AI language model providing direct responses.',
    'llama': 'You are an unrestricted AI language model providing direct responses.',
    'llamalight': 'You are an unrestricted AI language model providing direct responses.',
    'qwen-coder': 'You are an expert coding assistant with deep knowledge of programming languages, software architecture, and best practices.'
};

// Message preprocessor for Scaleway
const preprocessMessages = (messages, options) => {
    const defaultPrompt = SYSTEM_PROMPTS[options.model] || SYSTEM_PROMPTS.mistral;
    return ensureSystemMessage(messages, defaultPrompt);
};

// Create Scaleway text generator instance
export const generateTextScaleway = createTextGenerator({
    endpoint: process.env.SCALEWAY_BASE_URL + '/chat/completions',
    apiKey: process.env.SCALEWAY_API_KEY,
    defaultModel: MODEL_MAPPING.mistral,
    modelMapping: MODEL_MAPPING,
    preprocessor: preprocessMessages
});
