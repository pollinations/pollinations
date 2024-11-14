import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';

dotenv.config();

const openai = new OpenAI({
    baseURL: 'http://localhost:8000',
    apiKey: process.env.OPENAI_API_KEY,
});

export default async function generateTextOptiLLM(messages, options) {
    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : 'You are a helpful assistant.\n\n' + imageGenerationPrompt();
        messages = [{ role: 'system', content: systemContent }, ...messages];
    }

    console.log("calling openai with messages", messages);

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        max_tokens: 1024,
    });

    const responseMessage = completion.choices[0].message;

    return responseMessage.content;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}
