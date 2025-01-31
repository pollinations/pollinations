import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';
import debug from 'debug';

dotenv.config();
const log = debug('pollinations:deepseek');

const MODEL_MAPPING = {
    'deepseek-coder': 'deepseek-ai/deepseek-coder-33b-instruct',
    'deepseek': 'deepseek-ai/deepseek-67b-chat'
};

const preprocessMessages = (messages, options) => {
    const defaultSystemMessage = options.jsonMode 
        ? 'Respond in simple JSON format'
        : 'You are a helpful AI assistant.';
    return ensureSystemMessage(messages, defaultSystemMessage);
};

export const generateDeepseek = createTextGenerator({
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: MODEL_MAPPING['deepseek'],
    modelMapping: MODEL_MAPPING,
    preprocessor: preprocessMessages
});
