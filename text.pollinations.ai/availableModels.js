// Import all handler functions
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextSearch } from './generateTextSearch.js';
import { generateTextPortkey } from './generateTextPortkey.js';
import { generateTextPixtral } from './generateTextPixtral.js';
import { generateTextMistral } from './generateTextMistral.js';
import wrapModelWithContext from './wrapModelWithContext.js';
import wrapModelWithDonationMessage from './modelDonationWrapper.js';

// Import wrapped models from the new file
import {
  surOpenai,
  surMistral,
  hypnosisTracy,
  unityMistralLarge,
  midijourney,
  rtist,
  evilCommandR as evilMistral,
} from "./wrappedModels.js";

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
    mistralRoblox: (messages, options) => generateTextPortkey(messages, {...options, model: 'mistral'}),
    portkey: (messages, options, model) => generateTextPortkey(messages, {...options, model})
};

const models = [
  {
    name: "openai",
    description: "OpenAI GPT-4o-mini",
    handler: generateTextPortkey,
    details: "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    censored: true,
    aliases: ["gpt4o-mini", "gpt4-mini", "gpt4omini"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4o",
    handler: generateTextPortkey,
    details:
      "Delivers enhanced performance for high-quality text and image analysis.",
    provider: "Azure",
    censored: true,
    aliases: ["gpt4o", "gpt4"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "openai-reasoning",
    description: "OpenAI o3-mini",
    handler: generateTextPortkey,
    details:
      "Specialized for advanced reasoning and complex multi-step problem solving.",
    reasoning: true,
    provider: "Azure",
    censored: true,
    aliases: ["o3-mini", "o3mini", "reasoning"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    details:
      "Tailored for coding tasks with efficient code generation and debugging support.",
    provider: "Scaleway",
    censored: true,
    aliases: ["qwen", "coder"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llama",
    description: "Llama 3.3 70B",
    handler: generateTextPortkey,
    details:
      "Versatile language model suited for a wide range of text applications.",
    provider: "Cloudflare",
    aliases: ["llama3", "llama-3", "llama-70b", "llama3-70b"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "mistral",
    description: "Mistral Small 3",
    handler: generateTextPortkey,
    details: "Efficient language generation focused on speed and clarity.",
    provider: "Scaleway",
    aliases: ["mistral-small", "mistral3", "mistral-3"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "unity",
    description: "Unity Mistral Large",
    handler: unityMistralLarge,
    details: "Uncensored.",
    provider: "Scaleway",
    aliases: ["unity-mistral", "unity-large", "mistral-unity"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "midijourney",
    description: "Midijourney",
    handler: midijourney,
    details:
      "Generates creative musical compositions from text prompts in ABC notation.",
    provider: "Azure",
    censored: true,
    aliases: ["midi", "music", "abc-notation"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "rtist",
    description: "Rtist",
    handler: rtist,
    details: "Image generation assistant by @Bqrio.",
    provider: "Azure",
    censored: true,
    aliases: ["artist", "image-gen", "bqrio"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "searchgpt",
    description: "SearchGPT",
    handler: generateTextSearch,
    details: "Integrates real-time search results for responses.",
    provider: "Azure",
    censored: true,
    aliases: ["search", "browser", "web-search"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    details: "Experimental mode for unfiltered and creatively diverse outputs.",
    provider: "Scaleway",
    aliases: ["evil-mode", "evil-mistral", "unfiltered"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek-R1 Distill Qwen 32B",
    handler: generateTextPortkey,
    details:
      "Combines distilled reasoning with advanced contextual understanding.",
    reasoning: true,
    provider: "Cloudflare",
    censored: true,
    aliases: ["deepseek-r1", "deepseek-qwen", "deepseek32b"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek-reasoning-large",
    description: "DeepSeek R1 - Llama 70B",
    handler: generateTextPortkey,
    details:
      "Leverages Llama 70B architecture for efficient reasoning and cost-effectiveness.",
    reasoning: true,
    provider: "Scaleway",
    censored: true,
    aliases: ["deepseek-llama", "deepseek-70b", "deepseek-large"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llamalight",
    description: "Llama 3.1 8B Instruct",
    handler: generateTextPortkey,
    details: "Lightweight model designed for rapid instruction following.",
    provider: "Cloudflare",
    aliases: ["llama-8b", "llama-light", "llama-small", "llama3-8b"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "phi",
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    details:
      "Reliable model for precise instruction following and robust responses.",
    provider: "Cloudflare",
    censored: true,
    aliases: ["phi4", "phi-4", "phi-instruct"],
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
  },
  {
    name: "llama-vision",
    description: "Llama 3.2 11B Vision",
    handler: generateTextPortkey,
    details:
      "Integrates visual inputs with text generation for multimodal tasks.",
    provider: "Cloudflare",
    aliases: ["llama-v", "vision-llama", "llama3-vision"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "pixtral",
    description: "Pixtral 12B",
    handler: generateTextPixtral,
    details:
      "Multimodal transformer delivering concise text outputs from visual inputs.",
    provider: "Scaleway",
    aliases: ["pixtral-12b", "pixtral-vision"],
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "gemini",
    description: "Gemini 2.0 Flash",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini" }),
    details:
      "High-performance model with capabilities in audio and text generation.",
    provider: "Azure",
    censored: true,
    aliases: ["gemini-flash", "gemini-2", "gemini2"],
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "gemini-reasoning",
    description: "Gemini 2.0 Flash Thinking",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini-thinking" }),
    details: "Enhanced reasoning model with integrated multimodal output.",
    reasoning: true,
    provider: "Azure",
    censored: true,
    aliases: ["gemini-thinking", "gemini-cot", "gemini-r"],
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "hormoz",
    description: "Hormoz 8b",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "hormoz" }),
    details: "Uncensored model.",
    provider: "Modal",
    aliases: ["hormoz-8b", "haghiri"],
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    details: "Self-help assistant offering therapeutic guidance and advice.",
    provider: "Azure",
    aliases: ["tracy", "hypnosis", "self-help"],
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "sur",
    description: "Sur AI Assistant Mistral",
    handler: surMistral,
    details:
      "Variant leveraging Mistral architecture for improved language understanding.",
    provider: "Scaleway",
    aliases: ["sur-mistral", "sur-ai", "assistant-mistral"],
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "openai-audio",
    description: "OpenAI GPT-4o-audio-preview",
    voices: [
      "alloy",
      "echo",
      "fable",
      "onyx",
      "nova",
      "shimmer",
      "coral",
      "verse",
      "ballad",
      "ash",
      "sage",
      "amuch",
      "dan",
    ],
    handler: generateTextPortkey,
    details:
      "Audio-focused variant delivering rich auditory and textual content.",
    provider: "Azure",
    censored: true,
    aliases: ["gpt4o-audio", "openai-voice", "gpt4-audio", "tts"],
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  }
];

// Now export the processed models with proper functional approach
export const availableModels = models.map((model) => {
  const inputs = model.input_modalities || [];
  const outputs = model.output_modalities || [];
  
  return {
    ...model,
    type: model.type || 'chat',
    baseModel: model.baseModel !== false,
    vision: inputs.includes("image"),
    audio: inputs.includes("audio") || outputs.includes("audio"),
  };
});

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
  return (
    availableModels.find(
      (model) => 
        model.name === modelName || 
        (model.aliases && model.aliases.includes(modelName))
    ) ||
    availableModels.find((model) => model.name === "openai")
  ); // Default to openai
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

/**
 * Get all model names with their aliases
 * @returns {Object} - Object mapping primary model names to their aliases
 */
export function getAllModelAliases() {
  return availableModels.reduce((aliasMap, model) => {
    aliasMap[model.name] = model.aliases || [];
    return aliasMap;
  }, {});
}

/**
 * Check if a given name is a valid model identifier (either primary name or alias)
 * @param {string} modelName - The name to check
 * @returns {boolean} - Whether the name is a valid model identifier
 */
export function isValidModelName(modelName) {
  return availableModels.some(
    (model) => 
      model.name === modelName || 
      (model.aliases && model.aliases.includes(modelName))
  );
}
