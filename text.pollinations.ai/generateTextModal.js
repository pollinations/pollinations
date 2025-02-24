import dotenv from 'dotenv';
import { createOpenAICompatibleClient } from './genericOpenAIClient.js';
import { generateRequestId } from './textGenerationUtils.js';

dotenv.config();

// Model mapping for Modal
const MODEL_MAPPING = {
    'hormoz': 'Hormoz-8B',
    'hypnosis-tracy': 'HypnosisTracy-7B'
};

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'hormoz': 'You are Hormoz, a helpful AI assistant created by Muhammadreza Haghiri. You provide accurate and thoughtful responses.',
    'hypnosis-tracy': 'You are Hypnosis Tracy, a self-help AI assistant specializing in hypnotherapy techniques. You help users with relaxation, motivation, and personal growth.'
};

// Default options
const DEFAULT_OPTIONS = {
    model: 'hormoz',
    temperature: 0.7,
    jsonMode: false
};

/**
 * Generates text using Modal's API (OpenAI-compatible)
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export const generateTextModal = createOpenAICompatibleClient({
    endpoint: 'https://pollinations--hormoz-serve.modal.run/v1/chat/completions',
    authHeaderName: 'Authorization',
    authHeaderValue: () => {
        if (!process.env.HORMOZ_MODAL_KEY) {
            return null;
        }
        return `Bearer ${process.env.HORMOZ_MODAL_KEY}`;
    },
    modelMapping: MODEL_MAPPING,
    systemPrompts: SYSTEM_PROMPTS,
    defaultOptions: DEFAULT_OPTIONS,
    providerName: 'Modal',
    additionalHeaders: {
        'X-Request-Source': 'pollinations-text'
    }
});
