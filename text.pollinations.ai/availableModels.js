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
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4.1-mini",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.4,
      completion_tokens: 1.6,
      cached_tokens: 0.1,
    },
  },
  {
    name: "openai-fast",
    description: "OpenAI GPT-4.1 Nano",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "anonymous",
    community: false,
    aliases: "gpt-4.1-nano",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.1,
      completion_tokens: 0.4,
      cached_tokens: 0.025,
    },
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4.1",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4.1",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
  {
    name: "openai-reasoning",
    description: "OpenAI O3 (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    reasoning: true,
    provider: "chatwithmono.xyz",
    tier: "seed",
    community: false,
    aliases: "o3",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
  {
    name: "searchgpt",
    description: "OpenAI GPT-4o Mini Search Preview (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    search: true,
    provider: "chatwithmono.xyz",
    tier: "seed",
    community: false,
    aliases: "gpt-4o-mini-search",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.15,
      completion_tokens: 0.6,
      cached_tokens: 0.0375,
    },
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    provider: "Scaleway",
    tier: "anonymous",
    community: false,
    aliases: "qwen2.5-coder-32b-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.07,
      completion_tokens: 0.18,
      cached_tokens: 0.018,
    },
  },
  {
    name: "llamascout",
    description: "Llama 4 Scout 17B",
    handler: generateTextPortkey,
    provider: "Cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "llama-4-scout-17b-16e-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.27,
      completion_tokens: 0.85,
      cached_tokens: 0.06,
    },
  },
  {
    name: "mistral",
    description: "Mistral Small 3.1 24B",
    handler: generateTextPortkey,
    provider: "Cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "mistral-small-3.1-24b-instruct",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.1,
      completion_tokens: 0.3,
      cached_tokens: 0.025,
    },
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek R1 0528",
    handler: generateTextPortkey,
    reasoning: true,
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-r1-0528",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.55,
      completion_tokens: 2.19,
      cached_tokens: 0.14,
    },
  },
  {
    name: "phi",
    description: "Phi-4 Mini Instruct",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "anonymous",
    community: false,
    aliases: "phi-4-mini-instruct",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.065,
      completion_tokens: 0.25,
      cached_tokens: 0.01625,
    },
  },
  {
    name: "deepseek",
    description: "DeepSeek V3",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-v3",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.27,
      completion_tokens: 1.1,
      cached_tokens: 0.07,
    },
  },
  {
    name: "grok",
    description: "xAI Grok-3 Mini",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "grok-3-mini",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.3,
      completion_tokens: 0.5,
      cached_tokens: 0.075,
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
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4o-audio-preview",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
    pricing: {
      prompt_tokens: 10.0,
      completion_tokens: 40.0,
      cached_tokens: 5.0,
    },
  },

  // All community models - Reuse upstream endpoints
  {
    name: "unity",
    description: "Unity Unrestricted Agent",
    handler: unityMistralLarge,
    provider: "Cloudflare",
    uncensored: true,
    tier: "flower",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.1,
      completion_tokens: 0.3,
      cached_tokens: 0.025,
    },
  },
  {
    name: "mirexa",
    description: "Mirexa AI Companion",
    handler: generateTextMirexa,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
  {
    name: "midijourney",
    description: "MIDIjourney",
    handler: midijourney,
    provider: "Azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
  {
    name: "rtist",
    description: "Rtist",
    handler: rtist,
    provider: "Azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    provider: "Cloudflare",
    uncensored: true,
    tier: "flower",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.1,
      completion_tokens: 0.3,
      cached_tokens: 0.025,
    },
  },
  {
    name: "elixposearch",
    description: "Elixpo Search",
    handler: generateTextPortkey,
    provider: "Scaleway",
    tier: "seed",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.15,
      completion_tokens: 0.6,
      cached_tokens: 0.0375,
    },
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy",
    handler: hypnosisTracy,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.5,
      completion_tokens: 10.0,
      cached_tokens: 1.25,
    },
  },
  {
    name: "sur",
    description: "Sur AI Assistant",
    handler: surMistral,
    provider: "Cloudflare",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.1,
      completion_tokens: 0.3,
      cached_tokens: 0.025,
    },
  },
  {
    name: "bidara",
    description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
    handler: bidara,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 2.0,
      completion_tokens: 8.0,
      cached_tokens: 0.5,
    },
  },
];

// Sort models alphabetically by name at module level for consistency, but keep community: false first, then community: true
const sortedModels = [
  ...models.filter((m) => m.community === false).sort((a, b) => a.name.localeCompare(b.name)),
  ...models.filter((m) => m.community === true).sort((a, b) => a.name.localeCompare(b.name)),
];

// Set default pricing for models without explicit pricing
const modelsWithPricing = sortedModels.map((model) => {
  if (!model.pricing) {
    model.pricing = {
      prompt_tokens: 1,
      completion_tokens: 4,
      cached_tokens: 0.25,
    };
  }
  return model;
});

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

// Export model pricing for use in Tinybird tracker
export function getModelPricing(modelName) {
  // Find by exact name only
  const model = availableModels.find(
    (model) => model.name === modelName || model.aliases === modelName
  );
  
  if (model && model.pricing) {
    return model.pricing;
  }
  
  // Return default pricing if no match found
  return {
    prompt_tokens: 1,
    completion_tokens: 4,
    cached_tokens: 0.25,
  };
}

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
  return (
    availableModels.find(
      (model) => model.name === modelName || model.aliases === modelName
    ) || availableModels.find((model) => model.name === "openai")
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
