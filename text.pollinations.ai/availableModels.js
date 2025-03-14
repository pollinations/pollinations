// Import all handler functions
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextSearch } from './generateTextSearch.js';
import { generateTextPortkey } from './generateTextPortkey.js';
import wrapModelWithContext from './wrapModelWithContext.js';
import wrapModelWithDonationMessage from './modelDonationWrapper.js';

// Import persona prompts
import surSystemPrompt from './personas/sur.js';
import unityPrompt from './personas/unity.js';
import midijourneyPrompt from './personas/midijourney.js';
import rtistPrompt from './personas/rtist.js';
import evilPrompt from './personas/evil.js';
import hypnosisTracyPrompt from './personas/hypnosisTracy.js';

// Create wrapped models
const surOpenai = wrapModelWithContext(surSystemPrompt, generateTextPortkey, "openai");
const surMistral = wrapModelWithContext(surSystemPrompt, generateTextPortkey, "mistral");
const hypnosisTracy = wrapModelWithContext(hypnosisTracyPrompt, generateTextPortkey, "openai-large");
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateTextPortkey, "mistral");
const midijourney = wrapModelWithContext(midijourneyPrompt, generateTextPortkey, "openai-large");
const rtist = wrapModelWithContext(rtistPrompt, generateTextPortkey, "openai-large");
const evilCommandR = wrapModelWithContext(evilPrompt, generateTextPortkey, "mistral");

// Define model handlers
const handlers = {
    openai: (messages, options) => generateTextPortkey(messages, {...options, model: 'openai'}),
    deepseek: (messages, options) => generateDeepseek(messages, {...options, model: 'deepseek-chat'}),
    mistral: (messages, options) => generateTextPortkey(messages, {...options, model: 'mistral'}),
    portkey: (messages, options, model) => generateTextPortkey(messages, {...options, model})
};

export const availableModels = [
    {
        name: 'openai',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o-mini',
        baseModel: true,
        vision: true,
        handler: generateTextPortkey
    },
    {
        name: 'openai-large',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o',
        baseModel: true,
        vision: true,
        handler: generateTextPortkey
    },
    {
        name: 'openai-reasoning',
        type: 'chat',
        censored: true,
        description: 'OpenAI o3-mini',
        baseModel: true,
        reasoning: true,
        vision: true,
        handler: generateTextPortkey  
    },
    {
        name: 'qwen-coder',
        type: 'chat',
        censored: true,
        description: 'Qwen 2.5 Coder 32B',
        baseModel: true,
        handler: generateTextPortkey
    },
    {
        name: 'llama',
        type: 'chat',
        censored: false,
        description: 'Llama 3.3 70B',
        baseModel: true,
        handler: generateTextPortkey
    },
    {
        name: 'mistral',
        type: 'chat',
        censored: false,
        description: 'Mistral Nemo',
        baseModel: true,
        handler: handlers.mistral
    },
    {
        name: 'unity',
        type: 'chat',
        censored: false,
        description: 'Unity with Mistral Large by Unity AI Lab',
        baseModel: false,
        handler: unityMistralLarge
    },
    {
        name: 'midijourney',
        type: 'chat',
        censored: true,
        description: 'Midijourney musical transformer',
        baseModel: false,
        handler: midijourney
    },
    {
        name: 'rtist',
        type: 'chat',
        censored: true,
        description: 'Rtist image generator by @bqrio',
        baseModel: false,
        handler: rtist
    },
    {
        name: 'searchgpt',
        type: 'chat',
        censored: true,
        description: 'SearchGPT with realtime news and web search',
        baseModel: false,
        handler: generateTextSearch
    },
    {
        name: 'evil',
        type: 'chat',
        censored: false,
        description: 'Evil Mode - Experimental',
        baseModel: false,
        handler: evilCommandR
    },
    {
        name: 'deepseek',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-V3',
        baseModel: true,
        handler: handlers.deepseek
    },
    {
        name: 'claude',
        type: 'chat',
        censored: true,
        description: 'Claude 3.5 Haiku',
        baseModel: true,
        handler: wrapModelWithDonationMessage(
            (messages, options) => generateTextPortkey(messages, {...options, model: 'claude'}),
            'Claude 3.5 Haiku',
            {
                threshold: 50,
                currentDonations: 47
            }
        )
    },
    {
        name: 'deepseek-r1',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-R1 Distill Qwen 32B',
        baseModel: true,
        reasoning: true,
        provider: 'cloudflare',
        handler: generateTextPortkey
    },
    {
        name: 'deepseek-reasoner',
        type: 'chat',
        censored: true,
        description: 'DeepSeek R1 - Full',
        baseModel: true,
        reasoning: true,
        provider: 'deepseek',
        handler: generateDeepseek
    },
    {
        name: 'deepseek-r1-llama',
        type: 'chat',
        censored: true,
        description: 'DeepSeek R1 - Llama 70B',
        baseModel: true,
        reasoning: true,
        provider: 'scaleway',
        handler: generateTextPortkey
    },
    {
        name: 'llamalight',
        type: 'chat',
        censored: false,
        description: 'Llama 3.1 8B Instruct',
        baseModel: true,
        maxTokens: 7168, // Set reasonable limit for the 8B model
        handler: generateTextPortkey
    },
    {
        name: 'llamaguard',
        type: 'safety',
        censored: false,
        description: 'Llamaguard 7B AWQ',
        baseModel: false,
        provider: 'cloudflare',
        maxTokens: 4000, // Set max tokens below the model's context window of 4096
        handler: generateTextPortkey
    },
    {
        name: 'gemini',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash',
        baseModel: true,
        provider: 'google',
        handler: (messages, options) => generateTextPortkey(messages, {...options, model: 'gemini'})
    },
    {
        name: 'gemini-thinking',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash Thinking',
        baseModel: true,
        provider: 'google',
        handler: (messages, options) => generateTextPortkey(messages, {...options, model: 'gemini-thinking'})
    },
    {
        name: 'hormoz',
        type: 'chat',
        description: 'Hormoz 8b by Muhammadreza Haghiri',
        baseModel: true,
        provider: 'modal',
        handler: (messages, options) => generateTextPortkey(messages, {...options, model: 'hormoz'})
    },
    {
        name: 'hypnosis-tracy',
        type: 'chat',
        description: 'Hypnosis Tracy 7B - Self-help AI assistant',
        baseModel: false,
        provider: 'openai',
        handler: hypnosisTracy
    },
    {
        name: 'sur',
        type: 'chat',
        censored: true,
        description: 'Sur AI Assistant',
        baseModel: false,
        handler: surOpenai
    },
    {
        name: 'sur-mistral',
        type: 'chat',
        censored: true,
        description: 'Sur AI Assistant (Mistral)',
        baseModel: false,
        handler: surMistral
    },
    {
        name: 'llama-scaleway',
        type: 'chat',
        censored: false,
        description: 'Llama (Scaleway)',
        baseModel: true,
        handler: (messages, options) => generateTextPortkey(messages, {...options, model: 'llama-scaleway'})
    },
    {
        name: 'phi',
        type: 'chat',
        censored: true,
        description: 'Phi-4 Multimodal Instruct',
        baseModel: true,
        handler: generateTextPortkey
    },
    // {
    //     model: 'openai-audio',
    //     type: 'chat',
    //     censored: true,
    //     description: 'OpenAI GPT-4o-mini-audio',
    //     baseModel: true,
    //     audio: true,
    //     handler: generateTextPortkey
    // },
    {
        name: 'openai-audio',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o-audio-preview',
        baseModel: true,
        audio: true,
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'verse', 'ballad', 'ash', 'sage', 'amuch', 'aster', 'brook', 'clover', 'dan', 'elan', 'marilyn', 'meadow'],
        handler: generateTextPortkey
    }
];

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
    return availableModels.find(model => model.name === modelName) || 
           availableModels.find(model => model.name === 'openai'); // Default to openai
}

/**
 * Get a handler function for a specific model
 * @param {string} modelName - The name of the model
 * @returns {Function} - The handler function for the model, or the default handler if not found
 */
export function getHandler(modelName) {
    const model = findModelByName(modelName);
    return model.handler;
}

// For backward compatibility
export const modelHandlers = {};
availableModels.forEach(model => {
    if (model.handler) {
        modelHandlers[model.name] = model.handler;
    }
});
