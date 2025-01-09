import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.SCALEWAY_API_KEY,
    baseURL: process.env.SCALEWAY_BASE_URL,
});

const MODEL_MAP = {
    'qwen-coder': 'qwen2.5-coder-32b-instruct',
    'mistral': 'mistral-nemo-instruct-2407'
};

export async function generateTextScaleway(messages, options) {
    const { jsonMode = false, seed = null, temperature } = options;
    const modelName = MODEL_MAP[options.model] || MODEL_MAP.mistral;

    console.log("calling scaleway with messages", messages);

    const completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        seed: seed || undefined,
        temperature: temperature,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
    });

    return completion.choices[0].message.content;
}
