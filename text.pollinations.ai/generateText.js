import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

async function generateText(messages, { seed = null, jsonMode = false }) {
    // if json mode is activated prepend the system message
    if (jsonMode) {
        messages.unshift({ role: 'system', content: 'Respond in simple JSON format' });
    }
    const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        seed,
        response_format: jsonMode ? { type: 'json_object' } : undefined
    });

    return result.choices[0]?.message?.content;
}

export default generateText;