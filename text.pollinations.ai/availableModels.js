// Import all handler functions
import { generateTextPortkey } from "./generateTextPortkey.js";

// Import wrapped models from the new file
import {
  surMistral,
  hypnosisTracy,
  unityMistralLarge,
  midijourney,
  rtist,
  evilCommandR as evilMistral,
  generateTextMirexa,
  bidara,
} from "./wrappedModels.js";

const models = [
  // All Pollinations.AI models
  {
    name: "openai",
    description: "OpenAI GPT-4.1 Mini",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "anonymous",
    community: false,
    aliases: "gpt-4.1-mini",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.4,
      completion: 1.6,
      cache: 0.1,
    },
  },
  {
    name: "openai-fast",
    description: "OpenAI GPT-4.1 Nano",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "anonymous",
    community: false,
    aliases: "gpt-4.1-nano",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.1,
      completion: 0.4,
      cache: 0.025,
    },
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4.1",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4.1",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
  {
    name: "openai-roblox",
    description: "OpenAI GPT-4.1 Mini (Roblox)",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "flower",
    community: false,
    aliases: "gpt-4.1-mini-roblox",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.4,
      completion: 1.6,
      cache: 0.1,
    },
  },
  {
    name: "openai-reasoning",
    description: "OpenAI O3 (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    reasoning: true,
    provider: "chatwithmono.xyz",
    tier: "anonymous",
    community: false,
    aliases: "o3",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
  {
    name: "searchgpt",
    description: "OpenAI GPT-4o Mini Search Preview (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    search: true,
    provider: "chatwithmono.xyz",
    tier: "anonymous",
    community: false,
    aliases: "gpt-4o-mini-search",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.15,
      completion: 0.6,
      cache: 0.0375,
    },
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    provider: "scaleway",
    tier: "anonymous",
    community: false,
    aliases: "qwen2.5-coder-32b-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.07,
      completion: 0.18,
      cache: 0.018,
    },
  },
  {
    name: "llamascout",
    description: "Llama 4 Scout 17B",
    handler: generateTextPortkey,
    provider: "cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "llama-4-scout-17b-16e-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt: 0.27,
      completion: 0.85,
      cache: 0.06,
    },
  },
  {
    name: "mistral",
    description: "Mistral Small 3.1 24B",
    handler: generateTextPortkey,
    provider: "cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "mistral-small-3.1-24b-instruct",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.1,
      completion: 0.3,
      cache: 0.025,
    },
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek R1 0528",
    handler: generateTextPortkey,
    reasoning: true,
    provider: "azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-r1-0528",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt: 0.55,
      completion: 2.19,
      cache: 0.14,
    },
  },
  {
    name: "phi",
    description: "Phi-4 Mini Instruct",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "anonymous",
    community: false,
    aliases: "phi-4-mini-instruct",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt: 0.065,
      completion: 0.25,
      cache: 0.01625,
    },
  },
  {
    name: "deepseek",
    description: "DeepSeek V3",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-v3",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt: 0.27,
      completion: 1.1,
      cache: 0.07,
    },
  },
  {
    name: "grok",
    description: "xAI Grok-3 Mini",
    handler: generateTextPortkey,
    provider: "azure",
    tier: "seed",
    community: false,
    aliases: "grok-3-mini",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.3,
      completion: 0.5,
      cache: 0.075,
    },
  },
  {
    name: "openai-audio",
    description: "OpenAI GPT-4o Audio Preview",
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
    provider: "azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4o-audio-preview",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
    pricing: {
      prompt: 10.0,
      completion: 40.0,
      cache: 5.0,
    },
  },

  // All community models - Reuse upstream endpoints
  {
    name: "unity",
    description: "Unity Unrestricted Agent",
    handler: unityMistralLarge,
    provider: "cloudflare",
    uncensored: true,
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.1,
      completion: 0.3,
      cache: 0.025,
    },
  },
  {
    name: "mirexa",
    description: "Mirexa AI Companion",
    handler: generateTextMirexa,
    provider: "azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
  {
    name: "midijourney",
    description: "MIDIjourney",
    handler: midijourney,
    provider: "azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
  {
    name: "rtist",
    description: "Rtist",
    handler: rtist,
    provider: "azure",
    tier: "seed",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    provider: "cloudflare",
    uncensored: true,
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.1,
      completion: 0.3,
      cache: 0.025,
    },
  },
  {
    name: "elixposearch",
    description: "Elixpo Search",
    handler: generateTextPortkey,
    provider: "scaleway",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt: 0.15,
      completion: 0.6,
      cache: 0.0375,
    },
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy",
    handler: hypnosisTracy,
    provider: "azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
    pricing: {
      prompt: 2.5,
      completion: 10.0,
      cache: 1.25,
    },
  },
  {
    name: "sur",
    description: "Sur AI Assistant",
    handler: surMistral,
    provider: "cloudflare",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 0.1,
      completion: 0.3,
      cache: 0.025,
    },
  },
  {
    name: "bidara",
    description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
    handler: bidara,
    provider: "azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt: 2.0,
      completion: 8.0,
      cache: 0.5,
    },
  },
];

// Use the models array directly without sorting
const unsortedModels = models;

// Define default pricing values
const DEFAULT_PRICING = { prompt: 1, completion: 4, cache: 0.25 };

// Set default pricing using functional approach
const modelsWithPricing = unsortedModels.map(model => ({
  ...model,
  pricing: {
    ...DEFAULT_PRICING,
    ...model.pricing,
  },
}));

// Now export the processed models with proper functional approach
export const availableModels = modelsWithPricing.map((model) => {
  const inputs = model.input_modalities || [];
  const outputs = model.output_modalities || [];

  return {
    ...model,
    vision: inputs.includes("image"),
    audio: inputs.includes("audio") || outputs.includes("audio"),
  };
});

// Default pricing is now automatically applied to all models in the modelsWithPricing array

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
  return (
    availableModels.find(
      (model) => model.name === modelName || model.aliases === modelName
    ) || availableModels.find((model) => model.name === "openai-fast")
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
    aliasMap[model.name] = model.aliases ? [model.aliases] : [];
    return aliasMap;
  }, {});
}
