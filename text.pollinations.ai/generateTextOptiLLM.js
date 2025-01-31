import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('optillm');

const openai = new OpenAI({
    baseURL: 'http://localhost:8000/v1',
    apiKey: process.env.OPENAI_API_KEY,
});

const OPTILLM_MODEL = 'cot_reflection-readurls&memory&executecode-gpt-4o-mini';

export default async function generateTextOptiLLM(messages, options = {}) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        // Handle system messages with OptiLLM-specific default prompt
        const defaultPrompt = `You are a helpful assistant. If you are asked to run code, just generate it in python and return the code. It will be run for you.\n\n${options.jsonMode ? '' : imageGenerationPrompt()}`;
        messages = handleSystemMessage(messages, options, defaultPrompt);

        // Create standardized request body
        const requestBody = createRequestBody(messages, options, {
            max_tokens: 1024,
            temperature: 0.7
        });

        log(`[${requestId}] Sending request to OptiLLM API`, {
            model: OPTILLM_MODEL,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });

        const completion = await openai.chat.completions.create({
            model: OPTILLM_MODEL,
            ...requestBody
        });

        const completionTime = Date.now() - startTime;
        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: OPTILLM_MODEL
        });

        return standardizeResponse(completion, 'OptiLLM');
    } catch (error) {
        errorLog(`[${requestId}] Error in text generation`, {
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });

        return standardizeResponse({
            error: {
                message: error.message,
                code: error.status || 500
            }
        }, 'OptiLLM');
    }
}
