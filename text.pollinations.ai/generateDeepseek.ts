import dotenv from 'dotenv'
import fetch from 'node-fetch'
import debug from 'debug'

dotenv.config()

const log = debug('pollinations:deepseek')
const errorLog = debug('pollinations:deepseek:error')

export async function generateDeepseek(messages: Conversation, options: TextRequestData) {
    const startTime = Date.now()
    const requestId = Math.random().toString(36).substring(7)
    
    log(`[${requestId}] Starting DeepSeek generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options
    })

    try {
        const requestBody = {
            model: options.model,
            messages,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: 4096,
            stream: false,
            tools: options.tools,
            tool_choice: options.tool_choice
        }

        log(`[${requestId}] Sending request to DeepSeek API`, {
            timestamp: new Date().toISOString(),
            model: requestBody.model,
            maxTokens: requestBody.max_tokens
        })

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        log(`[${requestId}] Received response from DeepSeek API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
        })

        if (!response.ok) {
            const errorText = await response.text()
            errorLog(`[${requestId}] DeepSeek API error`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: errorText
            })
            throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorText}`)
        }

        const data = await response.json()
        const completionTime = Date.now() - startTime

        log(`[${requestId}] Successfully generated text`, {
            timestamp: new Date().toISOString(),
            completionTimeMs: completionTime,
            modelUsed: data.model,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
            totalTokens: data.usage?.total_tokens,
            reasoningContent: data.choices[0]?.message?.reasoning_content
        })

        return data
    } catch (error: any) {
        errorLog(`[${requestId}] Error in text generation`, {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        })
        
        throw error
    }
}
