// Import all handler functions
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextSearch } from './generateTextSearch.js';
import { generateTextPortkey } from './generateTextPortkey.js';
import { generateTextPixtral } from './generateTextPixtral.js';
import { generateTextMistral } from './generateTextMistral.js';
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
const surMistral = wrapModelWithContext(surSystemPrompt, generateTextMistral, "mistral");
const hypnosisTracy = wrapModelWithContext(hypnosisTracyPrompt, generateTextPortkey, "openai-large");
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateTextMistral, "mistral");
const midijourney = wrapModelWithContext(midijourneyPrompt, generateTextPortkey, "openai-large");
const rtist = wrapModelWithContext(rtistPrompt, generateTextPortkey, "openai-large");
const evilCommandR = wrapModelWithContext(evilPrompt, generateTextMistral, "mistral");

// Define model handlers
const handlers = {
    openai: (messages, options) => generateTextPortkey(messages, {...options, model: 'openai'}),
    deepseek: (messages, options) => generateDeepseek(messages, {...options, model: 'deepseek-chat'}),
    mistral: (messages, options) => generateTextMistral(messages, {...options, model: 'mistral'}),
    portkey: (messages, options, model) => generateTextPortkey(messages, {...options, model})
};

// List of models that are known to potentially be unavailable at times
export const potentiallyUnavailableModels = [
    'gemini', 
    'gemini-thinking', 
    'claude-hybridspace', 
    'deepseek', 
    'deepseek-reasoner', 
    'llama'
];

// Store model availability status
export const modelAvailability = new Map();

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
        // vision: true,
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
        description: 'Mistral Small 3.1 2503',
        baseModel: true,
        vision: true,
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
    // {
    //     name: 'claude',
    //     type: 'chat',
    //     censored: true,
    //     description: 'Claude 3.5 Haiku',
    //     baseModel: true,
    //     handler: wrapModelWithDonationMessage(
    //         (messages, options) => generateTextPortkey(messages, {...options, model: 'claude'}),
    //         'Claude 3.5 Haiku',
    //         {
    //             threshold: 50,
    //             currentDonations: 47
    //         }
    //     )
    // },
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
        name: 'phi',
        type: 'chat',
        censored: true,
        description: 'Phi-4 Instruct',
        baseModel: true,
        provider: 'cloudflare',
        handler: generateTextPortkey
    },
    {
        name: 'llama-vision',
        type: 'chat',
        censored: false,
        description: 'Llama 3.2 11B Vision',
        baseModel: true,
        provider: 'cloudflare',
        vision: true,
        handler: generateTextPortkey
    },
    {
        name: 'pixtral',
        type: 'chat',
        censored: false,
        description: 'Pixtral 12B',
        baseModel: true,
        provider: 'scaleway',
        vision: true,
        handler: generateTextPixtral
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
        name: 'openai-audio',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o-audio-preview',
        baseModel: true,
        audio: true,
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'verse', 'ballad', 'ash', 'sage', 'amuch', 'dan'],
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

/**
 * Check if a model is currently available
 * @param {string} modelName - The name of the model to check
 * @returns {Promise<boolean>} - Promise resolving to true if model is available, false otherwise
 */
export async function checkModelAvailability(modelName) {
    // Default to assuming the model is available
    if (!potentiallyUnavailableModels.includes(modelName)) {
        return true;
    }
    
    // Check if we've recently checked this model's availability
    const now = Date.now();
    const cachedStatus = modelAvailability.get(modelName);
    if (cachedStatus && (now - cachedStatus.timestamp < 60000)) { // Cache for 1 minute
        return cachedStatus.available;
    }
    
    try {
        const model = findModelByName(modelName);
        const handler = model.handler;
        
        // Make a minimal request to test availability
        await handler([{ role: 'user', content: 'test' }], { 
            model: modelName,
            max_tokens: 5,
            cache: false
        });
        
        // If we get here without an error, the model is available
        modelAvailability.set(modelName, { available: true, timestamp: now });
        return true;
    } catch (error) {
        // If there's an error, the model is unavailable
        modelAvailability.set(modelName, { available: false, timestamp: now });
        return false;
    }
}

/**
 * Get all models with their current availability status
 * @returns {Promise<Array>} - Promise resolving to array of models with availability status
 */
export async function getModelsWithAvailability() {
    const modelsWithStatus = await Promise.all(availableModels.map(async (model) => {
        const online = await checkModelAvailability(model.name);
        return {
            ...model,
            online
        };
    }));
    
    return modelsWithStatus;
}
