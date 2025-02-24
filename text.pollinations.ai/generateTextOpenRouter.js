import dotenv from 'dotenv';
import fetch from 'node-fetch';
import debug from 'debug';
import {
    validateAndNormalizeMessages,
    ensureSystemMessage,
    generateRequestId,
    cleanUndefined,
    createErrorResponse
} from './textGenerationUtils.js';

dotenv.config();

const log = debug('pollinations:openrouter');

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

// Default system prompts for different models
const SYSTEM_PROMPTS = {
    'claude-email': 'You are Claude, a helpful AI assistant created by Anthropic. You excel at drafting professional emails and communications.',
    'deepseek': 'You are DeepSeek, a helpful AI assistant. You provide accurate and thoughtful responses.',
    'qwen': 'You are Qwen, a helpful AI assistant developed by Alibaba Cloud. You provide accurate and thoughtful responses.',
    'qwen-coder': 'You are Qwen, an expert coding assistant with deep knowledge of programming languages, software architecture, and best practices.',
    'llama': 'You are Llama, a helpful AI assistant developed by Meta. You provide accurate and thoughtful responses.',
    'mistral': 'You are Mistral, a helpful AI assistant. You provide accurate and thoughtful responses.',
    'mistral-large': 'You are Mistral Large, a powerful AI assistant. You provide accurate, detailed, and thoughtful responses.',
    'llamalight': 'You are Llama, a helpful AI assistant developed by Meta. You provide accurate and thoughtful responses.'
};

/**
 * Generates text using OpenRouter API (gateway to multiple models)
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export async function generateTextOpenRouter(messages, options) {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    log(`[${requestId}] Starting text generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options
    });

    try {
        const modelName = MODEL_MAPPING[options.model] || MODEL_MAPPING['deepseek'];
        
        // Validate and normalize messages
        const validatedMessages = validateAndNormalizeMessages(messages);
        
        // Ensure system message is present
        const defaultSystemPrompt = SYSTEM_PROMPTS[options.model] || SYSTEM_PROMPTS.deepseek;
        const messagesWithSystem = ensureSystemMessage(validatedMessages, options, defaultSystemPrompt);
        
        const requestBody = {
            model: modelName,
            messages: messagesWithSystem,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: 4096,
            temperature: options.temperature,
            top_p: options.top_p,
            seed: typeof options.seed === 'number' ? Math.floor(options.seed) : undefined,
            tools: options.tools,
            tool_choice: options.tool_choice
        };

        // Clean undefined values
        const cleanedRequestBody = cleanUndefined(requestBody);

        log(`[${requestId}] Sending request to OpenRouter API`, {
            timestamp: new Date().toISOString(),
            model: cleanedRequestBody.model,
            maxTokens: cleanedRequestBody.max_tokens,
            temperature: cleanedRequestBody.temperature
        });
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://pollinations.ai",
                "X-Title": "Pollinations.AI",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(cleanedRequestBody)
        });

        log(`[${requestId}] Received response from OpenRouter API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            log(`[${requestId}] OpenRouter API error`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: errorData || 'Failed to parse error response'
            });
            
            return createErrorResponse(
                new Error(errorData?.error?.message || `OpenRouter API error: ${response.status} ${response.statusText}`),
                'OpenRouter'
            );
        }

        const data = await response.json();
        const completionTime = Date.now() - startTime;

        log(`[${requestId}] Successfully generated text`, {
            timestamp: new Date().toISOString(),
            completionTimeMs: completionTime,
            modelUsed: data.model,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens
        });

        // Ensure the response has all expected fields
        if (!data.id) {
            data.id = `openrouter-${requestId}`;
        }
        
        if (!data.object) {
            data.object = 'chat.completion';
        }
        
        if (!data.usage) {
            data.usage = {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            };
        }

        return data;
    } catch (error) {
        log(`[${requestId}] Error in text generation`, {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });
        
        return createErrorResponse(error, 'OpenRouter');
    }
}
