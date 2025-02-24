import { HfInference } from "@huggingface/inference";
import dotenv from 'dotenv';
import debug from 'debug';

const log = debug('pollinations:huggingface');

dotenv.config();

const MODEL_MAP = {
    'qwen-coder': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen': 'Qwen/Qwen2.5-72B-Instruct',
    'llama': 'meta-llama/Llama-3.3-70B-Instruct'
};

const DEFAULT_MODEL = MODEL_MAP['qwen-coder'];
const inference = new HfInference(process.env.HUGGINGFACE_TOKEN);

async function generateTextHuggingface(messages, { temperature, jsonMode = false, seed=null, model='qwen-coder' }) {
    log('=== Starting Text Generation ===');
    const selectedModel = MODEL_MAP[model] || DEFAULT_MODEL;
    log('Parameters received:\n    - Model: %s\n    - Temperature: %s\n    - JSON Mode: %s\n    - Seed: %s\n    - Number of messages: %s',
        model, temperature || 0.7, jsonMode, seed, messages.length);
    
    log('Input Messages: %O', messages);

    // If jsonMode and no system message, add one
    if (jsonMode && !messages.some(m => m.role === 'system')) {
        log('Adding JSON system message');
        messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
    }

    try {
        log('Making API call to model: %s', selectedModel);
        log('API Call Duration');
        
        const requestParams = {
            model: selectedModel,
            messages,
            temperature: temperature || 0.7,
            seed,
            stream: false,
            max_tokens: 8000, // Reduced to stay within the 16000 token limit
            max_length: 8000, // Reduced to stay within the 16000 token limit
        };
        log('Request Parameters: %O', requestParams);

        // For non-streaming response
        const response = await inference.chatCompletion(requestParams);
        log('API Call Duration');

        log('Response received: %O', {
            choices_length: response.choices?.length,
            first_choice_length: response.choices[0]?.message?.content?.length,
            usage: response.usage
        });

        const result = response;
        log(result)
        log('Generated text length: %s characters', result.length);
        log('=== Text Generation Complete ===');

        return result;
    } catch (error) {
        log('=== Error in Text Generation ===');
        log('Error Type: %s', error.constructor.name);
        log('Error Message: %s', error.message);
        log('Error Stack: %s', error.stack);
        throw error;
    }
}

export default generateTextHuggingface; 