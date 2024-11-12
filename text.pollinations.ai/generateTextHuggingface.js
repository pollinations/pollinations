import { HfInference } from "@huggingface/inference";
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_MODEL = 'Qwen/Qwen2.5-Coder-32B-Instruct';
const inference = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function generateTextHuggingface(messages, {  temperature, jsonMode = false, seed=null }) {
    // If jsonMode and no system message, add one
    if (jsonMode && !messages.some(m => m.role === 'system')) {
        messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
    }

    try {
        // For non-streaming response
        const response = await inference.chatCompletion({
            model: DEFAULT_MODEL,
            messages,
            temperature: temperature || 0.7,
            seed,
            stream: false,
            max_tokens: 16384,
            max_length: 16384,
        });

        return response.choices[0]?.message?.content || '';
    } catch (error) {
        console.error('Error calling Hugging Face API:', error.message);
        throw error;
    }
}

export default generateTextHuggingface; 