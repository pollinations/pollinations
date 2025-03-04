// Import all handler functions
import { generateTextScaleway } from './generateTextScaleway.js';
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextCloudflare } from './generateTextCloudflare.js';
import { generateTextGemini } from './generateTextGemini.js';
import { generateTextSearch } from './generateTextSearch.js';
import { generateTextOpenRouter } from './generateTextOpenRouter.js';
import { generateTextModal } from './generateTextModal.js';
import { generateTextPortkey } from './generateTextPortkey.js';
import wrapModelWithContext from './wrapModelWithContext.js';

// Import persona prompts
import surSystemPrompt from './personas/sur.js';
import unityPrompt from './personas/unity.js';
import midijourneyPrompt from './personas/midijourney.js';
import rtistPrompt from './personas/rtist.js';
import evilPrompt from './personas/evil.js';
import hypnosisTracyPrompt from './personas/hypnosisTracy.js';

// Create wrapped models
const surOpenai = wrapModelWithContext(surSystemPrompt, generateTextPortkey, "openai");
const surMistral = wrapModelWithContext(surSystemPrompt, generateTextScaleway, "mistral");
const hypnosisTracy = wrapModelWithContext(hypnosisTracyPrompt, generateTextPortkey, "openai-large");
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateTextScaleway, "mistral");
const midijourney = wrapModelWithContext(midijourneyPrompt, generateTextPortkey, "openai-large");
const rtist = wrapModelWithContext(rtistPrompt, generateTextPortkey, "openai-large");
const evilCommandR = wrapModelWithContext(evilPrompt, generateTextScaleway, "mistral");

// Define model handlers
const handlers = {
    openai: (messages, options) => generateTextPortkey(messages, {...options, model: 'openai'}),
    deepseek: (messages, options) => generateDeepseek(messages, {...options, model: 'deepseek-chat'}),
    mistral: (messages, options) => generateTextScaleway(messages, options),
    cloudflare: (messages, options) => generateTextCloudflare(messages, options),
    gemini: (messages, options) => generateTextGemini(messages, options),
    openRouter: (messages, options, model) => generateTextOpenRouter(messages, {...options, model}),
    modal: (messages, options) => generateTextModal(messages, options),
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
        description: 'OpenAI o1-mini',
        baseModel: true,
        reasoning: true,
        handler: generateTextPortkey  
    },
    {
        name: 'qwen-coder',
        type: 'chat',
        censored: true,
        description: 'Qwen 2.5 Coder 32B',
        baseModel: true,
        handler: (messages, options) => generateTextScaleway(messages, options)
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
        name: 'claude-hybridspace',
        type: 'chat',
        censored: true,
        description: 'Claude Hybridspace',
        baseModel: true,
        handler: (messages, options) => generateTextOpenRouter(messages, {...options, model: "anthropic/claude-3.5-haiku-20241022"})
    },
    {
        name: 'deepseek-r1',
        type: 'chat',
        censored: true,
        description: 'DeepSeek-R1 Distill Qwen 32B',
        baseModel: true,
        reasoning: true,
        provider: 'cloudflare',
        handler: generateTextCloudflare
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
        name: 'llamalight',
        type: 'chat',
        censored: false,
        description: 'Llama 3.1 8B Instruct',
        baseModel: true,
        handler: generateTextPortkey
    },
    {
        name: 'llamaguard',
        type: 'safety',
        censored: false,
        description: 'Llamaguard 7B AWQ',
        baseModel: false,
        provider: 'cloudflare',
        handler: generateTextCloudflare
    },
    {
        name: 'gemini',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash',
        baseModel: true,
        provider: 'google',
        handler: handlers.gemini
    },
    {
        name: 'gemini-thinking',
        type: 'chat',
        censored: true,
        description: 'Gemini 2.0 Flash Thinking',
        baseModel: true,
        provider: 'google',
        handler: handlers.gemini
    },
    {
        name: 'hormoz',
        type: 'chat',
        description: 'Hormoz 8b by Muhammadreza Haghiri',
        baseModel: false,
        provider: 'modal.com',
        censored: false,
        handler: handlers.modal
    },
    {
        name: 'hypnosis-tracy',
        type: 'chat',
        description: 'Hypnosis Tracy - Your Self-Help AI',
        baseModel: false,
        provider: 'modal.com',
        censored: false,
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
        handler: (messages, options) => generateTextScaleway(messages, {...options, model: 'llama'})
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
