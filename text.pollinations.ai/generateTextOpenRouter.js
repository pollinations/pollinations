import dotenv from 'dotenv';
import fetch from 'node-fetch';
import debug from 'debug';

dotenv.config();

const log = debug('pollinations:openrouter');

export async function generateTextOpenRouter(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    log(`[${requestId}] Starting text generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options
    });

    try {
        const requestBody = {
            model: options.model || "deepseek/deepseek-chat",
            messages,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: 4096,
            // temperature: options.temperature,
            // top_p: options.top_p,
            // seed: options.seed,
            tools: options.tools,
            tool_choice: options.tool_choice
        };

        log(`[${requestId}] Sending request to OpenRouter API`, {
            timestamp: new Date().toISOString(),
            model: requestBody.model,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });
        log('messages', messages);
        log('API Key', process.env.OPENROUTER_API_KEY);
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

        log(`[${requestId}] Received response from OpenRouter API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log(`[${requestId}] OpenRouter API error`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
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

        return data;
    } catch (error) {
        log(`[${requestId}] Error in text generation`, {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });
        throw error;
    }
}
