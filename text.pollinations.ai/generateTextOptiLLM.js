import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';

dotenv.config();

const openai = new OpenAI({
    baseURL: 'http://localhost:8000/v1',
    apiKey: process.env.OPENAI_API_KEY,
});

export default async function generateTextOptiLLM(messages, options) {
    if (!hasSystemMessage(messages)) {
        const prompt = `You are a helpful assistant. If you are asked to run code, just generate it in python and return the code. It will be run for you.\n\n`;
        const systemContent = options.jsonMode
            ? prompt + 'Respond in simple json format'
            : prompt + imageGenerationPrompt();
        messages = [{ role: 'system', content: systemContent }, ...messages];
    }

    console.log("calling openai with messages", messages);

    const completion = await openai.chat.completions.create({
        model: 'cot_reflection-readurls&memory&executecode-gpt-4o-mini',
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
