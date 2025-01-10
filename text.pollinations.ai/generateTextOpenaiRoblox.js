import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_ROBLOX_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_ROBLOX_OPENAI_API_KEY,
});

export async function generateText(messages, options) {
    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : 'You are a helpful assistant.';
        messages = [{ role: 'system', content: systemContent }, ...messages];
    } else if (options.jsonMode) {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!containsJSON(systemMessage.content)) {
            systemMessage.content += ' Respond with JSON.';
        }
    }

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini-roblox',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    });

    return completion;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

function containsJSON(text) {
    return text.toLowerCase().includes('json');
}
