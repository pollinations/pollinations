import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import debug from 'debug';
import { spamTheSpammersPrompt } from './pollinationsPrompt.js';

const log = debug('pollinations:openai');
const errorLog = debug('pollinations:openai:error');

dotenv.config();

const azureInstances = {
    'gpt-4o-mini': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    }),
    'gpt-4o': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_LARGE_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
    }),
    'o1-mini': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
        endpoint: process.env.AZURE_O1MINI_ENDPOINT,
        apiKey: process.env.AZURE_O1MINI_API_KEY,
    }),
};


const modelMap = {
    "openai": "gpt-4o-mini",
    "openai-reasoning": "o1-mini",
    "openai-large": "gpt-4o",
}

function countMessageCharacters(messages) {
    return messages.reduce((total, message) => {
        if (typeof message.content === 'string') {
            return total + message.content.length;
        }
        if (Array.isArray(message.content)) {
            return total + message.content.reduce((sum, part) => {
                if (part.type === 'text') {
                    return sum + part.text.length;
                }
                return sum;
            }, 0);
        }
        return total;
    }, 0);
}

export async function generateText(messages, options) {
    const MAX_CHARS = 512000;
    const totalChars = countMessageCharacters(messages);
    
    if (totalChars > MAX_CHARS) {
        errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
        throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
    }

    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : spamTheSpammersPrompt();
            
        messages = [{ role: 'system', content: systemContent }, ...messages];
    } else if (options.jsonMode) {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!containsJSON(systemMessage.content)) {
            systemMessage.content += ' Respond with JSON.';
        }
    }

    const modelName = modelMap[options.model] || 'gpt-4o-mini';
    if (modelName === 'o1-mini')  
        console.log("modelName", modelName);
    if (modelName === 'o1-mini') {
        messages = messages.map(message => {
            if (message.role === 'system') {
                return { ...message, role: 'user' };
            }
            return message;
        });
    }
    
    const azureInstance = azureInstances[modelName];
    

    // Handle streaming mode
    if (options.stream) {
        log('Streaming mode enabled in generateTextOpenai for model:', modelName, 'with options:', JSON.stringify(options));
        
        try {
            const stream = await azureInstance.chat.completions.create({
                model: modelName,
                messages,
                seed: options.seed,
                response_format: options.jsonMode ? { type: 'json_object' } : undefined,
                tools: options.tools,
                tool_choice: options.tool_choice,
                temperature: options.temperature,
                stream: true
            });
            log('Stream created successfully from Azure OpenAI');
            
            // The OpenAI SDK returns an AsyncIterable, not a standard Node.js stream
            // We need to convert it to a format that can be properly proxied
            log('Creating streaming response object from OpenAI SDK AsyncIterable');
            
            // Convert the AsyncIterable to a ReadableStream that can be properly proxied
            const readableStream = stream.toReadableStream();
            
            // Return a streaming response object
            return {
                id: `openai-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: modelName,
                stream: true,
                responseStream: readableStream,
                isSSE: true, // Mark as SSE stream for proper handling
                providerName: 'OpenAI',
                choices: [{ delta: { content: '' }, finish_reason: null, index: 0 }]
            };
        } catch (error) {
            errorLog('Error in streaming mode in generateTextOpenai:', error.message, error.stack);
            throw error;
        }
    }
    
    let completion = await azureInstance.chat.completions.create({
        model: modelName,
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools: options.tools,
        tool_choice: options.tool_choice,
        temperature: options.temperature,
    });

    return completion;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}
function containsJSON(text) {
    return text.toLowerCase().includes('json');
}
