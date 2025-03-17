// Import all handler functions
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextSearch } from './generateTextSearch.js';
import { generateTextPortkey } from './generateTextPortkey.js';
import { generateTextPixtral } from './generateTextPixtral.js';
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
    portkey: (messages, options, model) => generateTextPortkey(messages, {...options, model}),
    openai: (messages, options) => generateTextPortkey(messages, { ...options, model: 'openai' }),
    deepseek: (messages, options) => generateDeepseek(messages, { ...options, model: 'deepseek-chat' }),
    mistral: (messages, options) => generateTextPortkey(messages, { ...options, model: 'mistral' }),
    openRouter: (messages, options, model) => generateTextOpenRouter(messages, { ...options, model }),
    modal: (messages, options) => generateTextModal(messages, options),
    portkey: (messages, options, model) => generateTextPortkey(messages, { ...options, model })
};

// Define models first
const models = [
    {
        name: 'openai',
        description: 'OpenAI GPT-4o-mini',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'openai-large',
        description: 'OpenAI GPT-4o',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'openai-reasoning',
        description: 'OpenAI o3-mini',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: true,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'qwen-coder',
        description: 'Qwen 2.5 Coder 32B',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 128000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'llama',
        description: 'Llama 3.3 70B',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'mistral',
        description: 'Mistral Nemo',
        handler: handlers.mistral,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'unity',
        description: 'Unity with Mistral Large by Unity AI Lab',
        handler: unityMistralLarge,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'midijourney',
        description: 'Midijourney musical transformer',
        handler: midijourney,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'rtist',
        description: 'Rtist image generator by @bqrio',
        handler: rtist,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'searchgpt',
        description: 'SearchGPT with realtime news and web search',
        handler: generateTextSearch,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'evil',
        description: 'Evil Mode - Experimental',
        handler: evilCommandR,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'deepseek',
        description: 'DeepSeek-V3',
        handler: handlers.deepseek,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'claude',
        description: 'Claude 3.5 Haiku',
        handler: wrapModelWithDonationMessage(
            (messages, options) => generateTextPortkey(messages, {...options, model: 'claude'}),
            'Claude 3.5 Haiku',
            {
                threshold: 50,
                currentDonations: 47
            }
        ),
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'deepseek-r1',
        description: 'DeepSeek-R1 Distill Qwen 32B',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: true,
        owned_by: 'cloudflare',
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'deepseek-reasoning',
        description: 'DeepSeek R1 - Full',
        handler: generateDeepseek,
        details: "",
        available: true,
        reasoning: true,
        owned_by: 'deepseek',
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'deepseek-r1-llama',
        description: 'DeepSeek R1 - Llama 70B',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: true,
        owned_by: 'scaleway',
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'llamalight',
        description: 'Llama 3.1 8B Instruct',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'llamaguard',
        description: 'Llamaguard 7B AWQ',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: 'cloudflare',
        censored: false,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'phi',
        description: 'Phi-4 Instruct',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'llama-vision',
        description: 'Llama 3.2 11B Vision',
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'pixtral',
        description: 'Pixtral 12B',
        handler: generateTextPixtral,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
        tools: false
    },
    {
        name: 'gemini',
        description: 'Gemini 2.0 Flash',
        handler: (messages, options) =>
            generateTextPortkey(messages, { ...options, model: 'gemini' }),
        details: "",
        available: true,
        reasoning: false,
        owned_by: 'google',
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'gemini-reasoning',
        description: 'Gemini 2.0 Flash Thinking',
        handler: (messages, options) =>
            generateTextPortkey(messages, { ...options, model: 'gemini-thinking' }),
        details: "",
        available: true,
        reasoning: false,
        owned_by: 'google',
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'hormoz',
        description: 'Hormoz 8b by Muhammadreza Haghiri',
        handler: (messages, options) => generateTextPortkey(messages, {...options, model: 'hormoz'}),
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'hypnosis-tracy',
        description: 'Hypnosis Tracy 7B - Self-help AI assistant',
        handler: hypnosisTracy,
        details: "",
        available: true,
        reasoning: false,
        owned_by: 'modal.com',
        censored: false,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'sur',
        description: 'Sur AI Assistant',
        handler: surOpenai,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'sur-mistral',
        description: 'Sur AI Assistant (Mistral)',
        handler: surMistral,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'llama-scaleway',
        description: 'Llama (Scaleway)',
        handler: (messages, options) =>
            generateTextPortkey(messages, { ...options, model: 'llama-scaleway' }),
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: false,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    },
    {
        name: 'openai-audio',
        description: 'OpenAI GPT-4o-audio-preview',
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'verse', 'ballad', 'ash', 'sage', 'amuch', 'dan'],
        handler: generateTextPortkey,
        details: "",
        available: true,
        reasoning: false,
        owned_by: "",
        censored: true,
        max_token: 1000,
        input_modalities: ["text", "image"],
        output_modalities: ["audio", "text"],
        tools: false
    }
];

// Now export the processed models with proper functional approach
export const availableModels = models.map(model => {
    const inputs = model.input_modalities || model.input || [];
    const outputs = model.output_modalities || model.output || [];
    return {
        ...model,
        vision: inputs.includes("image"),
        audio: outputs.includes("audio")
    };
});

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
