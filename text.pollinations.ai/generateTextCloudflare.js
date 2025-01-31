import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse, createModelMapping } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('cloudflare');

// Model mapping for Cloudflare
const MODEL_MAPPING = {
    'llama': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'deepseek-r1': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
};

const getModel = createModelMapping(MODEL_MAPPING, 'llama');

export async function generateTextCloudflare(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        const modelName = getModel(options.model);
        
        // Handle system messages and validate messages
        messages = handleSystemMessage(messages, options, 'You are a helpful AI assistant.');
        const validatedMessages = messages.map(msg => ({
            role: msg.role || 'user',
            content: msg.content || ''
        }));

        // Create standardized request body
        const requestBody = createRequestBody(validatedMessages, options, {
            max_tokens: 4096,
            temperature: 0.7
        });

        log(`[${requestId}] Sending request to Cloudflare API`, {
            model: modelName,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelName}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.CLOUDFLARE_AUTH_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            errorLog(`[${requestId}] Cloudflare API error`, {
                status: response.status,
                statusText: response.statusText,
                error: errorData || 'Failed to parse error response'
            });
            
            return standardizeResponse({
                error: {
                    message: errorData?.errors?.[0]?.message || `Cloudflare API error: ${response.status} ${response.statusText}`,
                    code: response.status
                }
            }, 'Cloudflare');
        }

        const data = await response.json();
        const completionTime = Date.now() - startTime;

        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: modelName
        });

        // Standardize the response format
        return standardizeResponse({
            choices: [{
                message: {
                    role: 'assistant',
                    content: data.result.response
                },
                finish_reason: 'stop'
            }],
            model: modelName,
            created: Math.floor(startTime / 1000),
            usage: data.result.usage || {}
        }, 'Cloudflare');
    } catch (error) {
        errorLog(`[${requestId}] Error in text generation`, {
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });
        throw error;
    }
}
