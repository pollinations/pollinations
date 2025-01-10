import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

export async function generateDeepseek(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    console.log(`[${requestId}] Starting DeepSeek generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options
    });

    try {
        const requestBody = {
            model: "deepseek-chat",
            messages,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: 4096,
            stream: false,
            tools: options.tools,
            tool_choice: options.tool_choice
        };

        console.log(`[${requestId}] Sending request to DeepSeek API`, {
            timestamp: new Date().toISOString(),
            model: requestBody.model,
            maxTokens: requestBody.max_tokens
        });

        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        console.log(`[${requestId}] Received response from DeepSeek API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${requestId}] DeepSeek API error`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const completionTime = Date.now() - startTime;

        console.log(`[${requestId}] Successfully generated text`, {
            timestamp: new Date().toISOString(),
            completionTimeMs: completionTime,
            modelUsed: data.model,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens
        });

        return data;
    } catch (error) {
        console.error(`[${requestId}] Error in text generation`, {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });
        throw error;
    }
}
