import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import { spamTheSpammersPrompt } from './pollinationsPrompt.js';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

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

export async function generateText(messages, options = {}) {
    const MAX_CHARS = 56000;
    const totalChars = countMessageCharacters(messages);
    
    if (totalChars > MAX_CHARS) {
        console.error(`!!!!!!!!!!! Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars}) !!!!!!!!!!!`);
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

    const completionOptions = {
        model: 'gpt-4o-mini',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        stream: options.stream,
        max_tokens: options.max_tokens || 4096,
    };

    if (options.tools?.length > 0) {
        completionOptions.tools = options.tools;
        completionOptions.tool_choice = options.tool_choice || "auto";
        if (options.parallel_tool_calls === false) {
            completionOptions.parallel_tool_calls = false;
        }
    }

    return openai.chat.completions.create(completionOptions);
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

function containsJSON(text) {
    return text.toLowerCase().includes('json');
}
