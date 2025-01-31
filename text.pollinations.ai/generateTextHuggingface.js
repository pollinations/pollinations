import { HfInference } from "@huggingface/inference";
import dotenv from 'dotenv';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse, createModelMapping } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('huggingface');

const MODEL_MAPPING = {
    'qwen-coder': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen': 'Qwen/Qwen2.5-72B-Instruct',
    'llama': 'meta-llama/Llama-3.3-70B-Instruct'
};

const getModel = createModelMapping(MODEL_MAPPING, 'qwen-coder');
const inference = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function generateTextHuggingface(messages, options) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        const modelName = getModel(options.model);

        // Handle system messages
        messages = handleSystemMessage(messages, options, 'You are a helpful AI assistant.');

        // Create standardized request body with HuggingFace-specific adjustments
        const baseRequestBody = createRequestBody(messages, options, {
            max_tokens: 16384,
            temperature: 0.7
        });

        // Adjust for HuggingFace-specific parameters
        const requestParams = {
            model: modelName,
            ...baseRequestBody,
            stream: false,
            max_length: baseRequestBody.max_tokens, // HuggingFace uses max_length instead of max_tokens
        };

        log(`[${requestId}] Sending request to HuggingFace API`, {
            model: modelName,
            maxLength: requestParams.max_length,
            temperature: requestParams.temperature
        });

        const response = await inference.chatCompletion(requestParams);

        const completionTime = Date.now() - startTime;
        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: modelName,
            responseLength: response.choices?.[0]?.message?.content?.length
        });

        return standardizeResponse({
            choices: response.choices,
            model: modelName,
            created: Math.floor(startTime / 1000),
            usage: response.usage || {}
        }, 'HuggingFace');
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
        }, 'HuggingFace');
    }
}

export default generateTextHuggingface;