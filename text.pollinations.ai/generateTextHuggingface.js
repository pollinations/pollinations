import { HfInference } from "@huggingface/inference";
import dotenv from 'dotenv';

dotenv.config();

const MODEL_MAP = {
    'qwen-coder': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen': 'Qwen/Qwen2.5-72B-Instruct',
    'llama': 'meta-llama/Llama-3.3-70B-Instruct'
};

const DEFAULT_MODEL = MODEL_MAP['qwen-coder'];
const inference = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function generateTextHuggingface(messages, { temperature, jsonMode = false, seed=null, model='qwen-coder' }) {
    console.log('=== Starting Text Generation ===');
    const selectedModel = MODEL_MAP[model] || DEFAULT_MODEL;
    console.log(`Parameters received:
    - Model: ${model} (${selectedModel})
    - Temperature: ${temperature || 0.7}
    - JSON Mode: ${jsonMode}
    - Seed: ${seed}
    - Number of messages: ${messages.length}`);
    
    console.log('Input Messages:', JSON.stringify(messages, null, 2));

    // If jsonMode and no system message, add one
    if (jsonMode && !messages.some(m => m.role === 'system')) {
        console.log('Adding JSON system message');
        messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
    }

    try {
        console.log(`Making API call to model: ${selectedModel}`);
        console.time('API Call Duration');
        
        const requestParams = {
            model: selectedModel,
            messages,
            temperature: temperature || 0.7,
            seed,
            stream: false,
            max_tokens: 16384,
            max_length: 16384,
        };
        console.log('Request Parameters:', JSON.stringify(requestParams, null, 2));

        // For non-streaming response
        const response = await inference.chatCompletion(requestParams);
        console.timeEnd('API Call Duration');

        console.log('Response received:', {
            choices_length: response.choices?.length,
            first_choice_length: response.choices[0]?.message?.content?.length,
            usage: response.usage
        });

        const result = response;
        console.log(result)
        console.log(`Generated text length: ${result.length} characters`);
        console.log('=== Text Generation Complete ===');

        return result;
    } catch (error) {
        console.error('=== Error in Text Generation ===');
        console.error('Error Type:', error.constructor.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        if (error.response) {
            console.error('API Response Status:', error.response.status);
            console.error('API Response Data:', error.response.data);
        }
        throw error;
    }
}

export default generateTextHuggingface; 