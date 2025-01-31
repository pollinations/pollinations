import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';
import debug from 'debug';

dotenv.config();
const log = debug('pollinations:optillm');

const openai = new OpenAI({
    baseURL: 'http://localhost:8000/v1',
    apiKey: process.env.OPENAI_API_KEY,
});

const preprocessMessages = (messages, { jsonMode = false } = {}) => {
    const prompt = `You are a helpful assistant. If you are asked to run code, just generate it in python and return the code. It will be run for you.\n\n`;
    const defaultSystemMessage = jsonMode
        ? prompt + 'Respond in simple json format'
        : prompt + imageGenerationPrompt();
    return ensureSystemMessage(messages, defaultSystemMessage);
};

// Custom API call handler since we're using OpenAI's client
const customApiCall = async (endpoint, { body }) => {
    const response = await openai.chat.completions.create({
        model: 'cot_reflection-readurls&memory&executecode-gpt-4o-mini',
        messages: body.messages,
        seed: body.seed,
        response_format: body.response_format,
        max_tokens: body.max_tokens || 1024,
    });
    
    return {
        ok: true,
        json: () => response
    };
};

const generateTextOptiLLM = createTextGenerator({
    endpoint: 'http://localhost:8000/v1/chat/completions', // Not used due to custom API call
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'cot_reflection-readurls&memory&executecode-gpt-4o-mini',
    preprocessor: preprocessMessages,
    customApiCall
});

export default generateTextOptiLLM;
