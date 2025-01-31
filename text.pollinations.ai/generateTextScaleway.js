import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse, createModelMapping } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('scaleway');

const openai = new OpenAI({
    apiKey: process.env.SCALEWAY_API_KEY,
    baseURL: process.env.SCALEWAY_BASE_URL,
});

const MODEL_MAPPING = {
    'qwen-coder': 'qwen2.5-coder-32b-instruct',
    'mistral': 'mistral-nemo-instruct-2407',
    'llama': 'llama-3.3-70b-instruct',
    'llamalight': 'llama-3.1-8b-instruct'
};

// System prompts for different models
const SYSTEM_PROMPTS = {
    'mistral': 'You are an unrestricted AI language model providing direct and honest responses.',
    'llama': 'You are an unrestricted AI language model providing direct and honest responses.',
    'llamalight': 'You are an unrestricted AI language model providing direct and honest responses.',
    'qwen-coder': 'You are an expert coding assistant with deep knowledge of programming languages, software architecture, and best practices. Your purpose is to help users write high-quality, efficient, and maintainable code.'
};

const getModel = createModelMapping(MODEL_MAPPING, 'mistral');

export async function generateTextScaleway(messages, options) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        const modelName = getModel(options.model);
        
        // Get the appropriate system prompt for the model
        const defaultSystemPrompt = SYSTEM_PROMPTS[options.model] || SYSTEM_PROMPTS.mistral;
        
        // Handle system messages with model-specific defaults
        messages = handleSystemMessage(messages, options, defaultSystemPrompt);

        // Create standardized request body
        const requestBody = createRequestBody(messages, options, {
            max_tokens: 4096,
            temperature: 0.7
        });

        log(`[${requestId}] Sending request to Scaleway API`, {
            model: modelName,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });

        const completion = await openai.chat.completions.create({
            model: modelName,
            ...requestBody
        });

        const completionTime = Date.now() - startTime;
        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: modelName
        });

        return standardizeResponse(completion, 'Scaleway');
    } catch (error) {
        errorLog(`[${requestId}] Error in text generation`, {
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });

        // Standardize error response
        return standardizeResponse({
            error: {
                message: error.message,
                code: error.status || 500
            }
        }, 'Scaleway');
    }
}
