import dotenv from 'dotenv';
import fetch from 'node-fetch';
import debug from 'debug';

dotenv.config();

const log = debug('pollinations:gemini');

// Model mapping for Gemini
const MODEL_MAPPING = {
    'gemini': 'gemini-2.0-flash-exp',
    'gemini-thinking': 'gemini-2.0-flash-thinking-exp-01-21'
};

export async function generateTextGemini(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    log(`[${requestId}] Starting text generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options: JSON.stringify(options, null, 2)
    });

    try {
        const modelName = MODEL_MAPPING[options.model] || MODEL_MAPPING['gemini'];
        
        // Ensure each message has required properties and format for Gemini
        const validatedMessages = messages.map(msg => ({
            role: msg.role || 'user',
            content: msg.content || ''
        }));

        const requestBody = {
            model: modelName,
            messages: validatedMessages,
            temperature: options.temperature,
            n: 1
        };

        if (options.jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        // Remove undefined values
        Object.keys(requestBody).forEach(key => 
            requestBody[key] === undefined && delete requestBody[key]
        );

        log(`[${requestId}] Sending request to Gemini API`, {
            timestamp: new Date().toISOString(),
            model: modelName,
            request: JSON.stringify({
                temperature: requestBody.temperature,
                messages: requestBody.messages.map(m => ({
                    role: m.role,
                    content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')
                }))
            }, null, 2)
        });

        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        log(`[${requestId}] Received response from Gemini API`, {
            timestamp: new Date().toISOString(),
            status: response.status,
            statusText: response.statusText,
            headers: JSON.stringify(Object.fromEntries(response.headers), null, 2)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorObject = {
                timestamp: new Date().toISOString(),
                status: response.status,
                statusText: response.statusText,
                error: JSON.stringify(errorData || 'Failed to parse error response', null, 2)
            };
            log(`[${requestId}] Gemini API error`, errorObject);
            
            throw new Error('Failed to generate text with Gemini API. \n\n' + JSON.stringify(errorObject, null, 2));
        }

        const data = await response.json();
        const endTime = Date.now();

        log(`[${requestId}] Successfully generated text`, {
            timestamp: new Date().toISOString(),
            duration: endTime - startTime,
            response: JSON.stringify({
                content: data.choices[0]?.message?.content?.substring(0, 100) + '...'
            }, null, 2)
        });

        return data;
    } catch (error) {
        log(`[${requestId}] Unexpected error`, {
            timestamp: new Date().toISOString(),
            error: error.stack || error.message
        });

        return {
            error: {
                message: error.message || 'An unexpected error occurred',
                code: error.code || 500,
                metadata: {
                    provider_name: 'Gemini'
                }
            }
        };
    }
}
