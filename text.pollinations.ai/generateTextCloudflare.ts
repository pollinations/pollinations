import dotenv from 'dotenv'
import fetch from 'node-fetch'
import debug from 'debug'

dotenv.config()

const log = debug('pollinations:cloudflare')

// Model mapping for Cloudflare
const MODEL_MAPPING: Record<string, string> = {
    'llama': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'deepseek-r1': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
}

export async function generateTextCloudflare(messages: Conversation, options: TextRequestData) {
    const startTime = Date.now()
    const requestId = Math.random().toString(36).substring(7)

    log(`[${requestId}] Starting text generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options
    })

    try {
        const modelName = MODEL_MAPPING[options.model ?? 'llama'] ?? MODEL_MAPPING['llama']

        // Ensure each message has required properties
        const validatedMessages = messages.map(msg => ({
            role: msg.role ?? 'user',
            content: msg.content ?? ''
        }))

        const requestBody: Record<string, any> = {
            messages: validatedMessages,
            max_tokens: 4096,
            temperature: options.temperature,
            // top_p: options.top_p,
            stream: options.stream
        }

        if (typeof options.seed === 'number') requestBody.seed = Math.floor(options.seed)
        if (options.jsonMode) requestBody.response_format = { type: 'json_object' }
        if (options.tools) requestBody.tools = options.tools
        if (options.tool_choice) requestBody.tool_choice = options.tool_choice

        // Remove undefined values
        Object.keys(requestBody).forEach(key => requestBody[key] === undefined && delete requestBody[key])

        log(`[${requestId}] Sending request to Cloudflare API`, {
            timestamp: new Date().toISOString(),
            model: modelName,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        })

        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CLOUDFLARE_AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })

        log(`[${requestId}] Received response from Cloudflare API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers)
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => null)
            log(`[${requestId}] Cloudflare API error`, {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: errorData || 'Failed to parse error response'
            })

            return {
                error: {
                    message: errorData?.errors?.[0]?.message || `Cloudflare API error: ${response.status} ${response.statusText}`,
                    code: response.status,
                    metadata: {
                        raw: errorData,
                        provider_name: 'Cloudflare'
                    }
                }
            }
        }

        const data = await response.json()
        const completionTime = Date.now() - startTime

        log(`[${requestId}] Successfully generated text`, {
            timestamp: new Date().toISOString(),
            completionTimeMs: completionTime,
            modelUsed: modelName
        })

        // Transform Cloudflare response format to match OpenRouter format
        return {
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
        }
    } catch (error: any) {
        log(`[${requestId}] Error in text generation`, {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        })
        throw error
    }
}
