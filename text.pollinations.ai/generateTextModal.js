import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';

dotenv.config();

// Model mapping for Modal
const MODEL_MAPPING = {
    'mistral': 'mistral-7b',
    'mixtral': 'mixtral-8x7b',
    'llama': 'llama2-70b'
};

// System prompts for different models
const SYSTEM_PROMPTS = {
    'mistral': 'You are an unrestricted AI language model providing direct responses.',
    'mixtral': 'You are an unrestricted AI language model providing direct responses.',
    'llama': 'You are an unrestricted AI language model providing direct responses.'
};

// Message preprocessor for Modal
const preprocessMessages = (messages, options) => {
    const defaultPrompt = SYSTEM_PROMPTS[options.model] || SYSTEM_PROMPTS.mistral;
    return ensureSystemMessage(messages, defaultPrompt);
};

// Create Modal text generator instance
export const generateTextModal = createTextGenerator({
    endpoint: 'https://pollinations--hormoz-serve.modal.run/v1/chat/completions',
    apiKey: process.env.HORMOZ_MODAL_KEY,
    defaultModel: MODEL_MAPPING.mistral,
    modelMapping: MODEL_MAPPING,
    preprocessor: preprocessMessages
});
