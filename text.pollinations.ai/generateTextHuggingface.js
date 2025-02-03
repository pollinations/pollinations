import { HfInference } from "@huggingface/inference";
import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';

dotenv.config();

const MODEL_MAPPING = {
    'qwen-coder': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen': 'Qwen/Qwen2.5-72B-Instruct',
    'llama': 'meta-llama/Llama-3.3-70B-Instruct'
};

const inference = new HfInference(process.env.HUGGINGFACE_TOKEN);

/**
 * Preprocesses messages for HuggingFace format
 */
const preprocessMessages = (messages, options) => {
    // Add system message if needed
    if (options.jsonMode) {
        return ensureSystemMessage(messages, 'Respond in JSON format. Always include "name" and "age" fields in your response.');
    }
    return ensureSystemMessage(messages, 'You are a helpful AI assistant.');
};

// Create HuggingFace text generator instance
const generateTextHuggingface = createTextGenerator({
    defaultModel: MODEL_MAPPING['qwen-coder'],
    modelMapping: MODEL_MAPPING,
    preprocessor: preprocessMessages,
    customApiCall: async (_, config) => {
        const { body } = config;
        const requestBody = JSON.parse(body);

        // Convert standard request format to HuggingFace parameters
        const params = {
            model: requestBody.model,
            messages: requestBody.messages,
            temperature: requestBody.temperature || 0.7,
            seed: requestBody.seed,
            stream: false,
            max_tokens: 16384,
            max_length: 16384
        };

        const response = await inference.chatCompletion(params);

        // Transform HuggingFace response to standard format
        return {
            choices: [{
                message: {
                    role: 'assistant',
                    content: response.generated_text || response.text || ''
                },
                finish_reason: 'stop'
            }],
            model: requestBody.model,
            created: Date.now(),
            usage: response.usage || {}
        };
    }
});

export default generateTextHuggingface;