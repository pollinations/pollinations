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
    }

    console.log("calling openai with messages", messages);

    let completion;
    let responseMessage;
    let attempts = 0;
    const maxAttempts = 3;

    do {
        completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini-roblox',
            messages,
            seed: options.seed + attempts,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        });

        responseMessage = completion.choices[0].message;
        attempts++;
    } while ((!responseMessage.content || responseMessage.content === '') && attempts < maxAttempts);

    return responseMessage.content;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}
