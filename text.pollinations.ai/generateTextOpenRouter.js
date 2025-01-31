import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse, createModelMapping } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('openrouter');

// Model mapping for OpenRouter
const MODEL_MAPPING = {
    'claude-email': 'anthropic/claude-3-sonnet',  // Map to Claude 3
    'deepseek': 'deepseek/deepseek-chat',
    'qwen': 'qwen/qwen1.5-72b',
    'qwen-coder': 'qwen/qwen1.5-72b-chat',
    'llama': 'meta-llama/llama-3-70b-chat',
    'mistral': 'mistralai/mistral-7b-instruct',
    'mistral-large': 'mistralai/mistral-large',
    'llamalight': 'meta-llama/llama-3-8b-chat'
};

const getModel = createModelMapping(MODEL_MAPPING, 'deepseek');

export async function generateTextOpenRouter(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        const modelName = getModel(options.model);
        
        // Handle system messages
        messages = handleSystemMessage(messages, options, 'You are a helpful AI assistant.');

        // Create standardized request body
        const requestBody = {
            ...createRequestBody(messages, options, {
                max_tokens: 4096,
                temperature: 0.7
            }),
            model: modelName // OpenRouter requires model in the request body
        };

        log(`[${requestId}] Sending request to OpenRouter API`, {
            model: modelName,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://pollinations.ai",
                "X-Title": "Pollinations.AI",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            errorLog(`[${requestId}] OpenRouter API error`, {
                status: response.status,
                statusText: response.statusText,
                error: errorData || 'Failed to parse error response'
            });
            
            return standardizeResponse({
                error: {
                    message: errorData?.error?.message || `OpenRouter API error: ${response.status} ${response.statusText}`,
                    code: response.status
                }
            }, 'OpenRouter');
        }

        const data = await response.json();
        const completionTime = Date.now() - startTime;

        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: data.model,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens
        });

        // OpenRouter already returns data in the standard format, but we still run it through
        // standardizeResponse for consistency and to handle any edge cases
        return standardizeResponse(data, 'OpenRouter');
    } catch (error) {
        errorLog(`[${requestId}] Error in text generation`, {
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });
        throw error;
    }
}
