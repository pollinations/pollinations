import dotenv from 'dotenv';
import fetch from 'node-fetch';
import debug from 'debug';

dotenv.config();

const log = debug('pollinations:modal');

// Model mapping for Modal
const MODEL_MAPPING = {
    'hormoz': 'Hormoz-8B',
};

export async function generateTextModal(messages, options) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    log(`[${requestId}] Starting text generation request`, {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        options: JSON.stringify(options, null, 2)
    });

    try {
        const modelName = MODEL_MAPPING[options.model] || MODEL_MAPPING['modal'];
        log(`[${requestId}] Using model: ${modelName}`);
        // Ensure each message has required properties and format for Modal
        const validatedMessages = messages.map(msg => ({
            role: msg.role || 'user',
            content: msg.content || ''
        }));

        const requestBody = {
            model: modelName,
            messages: validatedMessages,
            temperature: options.temperature,
        };

        if (options.jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        // Remove undefined values
        Object.keys(requestBody).forEach(key => 
            requestBody[key] === undefined && delete requestBody[key]
        );

        log(`[${requestId}] Sending request to Modal API`, {
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
            'https://pollinations--hormoz-serve.modal.run/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.HORMOZ_MODAL_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Request-Source': 'pollinations-text'
                },
                body: JSON.stringify(requestBody)
            }
        );

        log(`[${requestId}] Received response from Modal API`, {
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
            log(`[${requestId}] Modal API error`, errorObject);
            
            throw new Error('Failed to generate text with Modal API. \n\n' + JSON.stringify(errorObject, null, 2));
        }
        const text = await response.text();
        log(`[${requestId}] Response text:`, text);
        const data = JSON.parse(text);
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
        log(`[${requestId}] Error generating text:`, error);
        throw error;
    }
}
