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
    description: "GPT-4.1-mini",
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
    description: "GPT-4.1-nano",
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
    description: "GPT-4.1",
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
    description: "OpenAI GPT-4o mini search preview (provided by chatwithmono.xyz)",
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
      prompt_tokens: 0.06,
      completion_tokens: 0.15,
      cached_tokens: 0.015,
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
      prompt_tokens: 0.18,
      completion_tokens: 0.59,
      cached_tokens: 0.045,
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
    description: "DeepSeek R1-0528",
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
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    provider: "Azure",
    tier: "anonymous",
    community: false,
    aliases: "phi-4-mini-instruct",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.13,
      completion_tokens: 0.5,
      cached_tokens: 0.0325,
    },
  },
  {
    name: "deepseek",
    description: "DeepSeek-V3",
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
    description: "xAi Grok-3 Mini",
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
    description: "GPT-4o-audio-preview",
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
      prompt_tokens: 2.5,
      completion_tokens: 10.0,
      cached_tokens: 1.25,
    },
  },

  // All community models
  // Community models below reuse upstream endpoints – pricing handled upstream, so no pricing metadata added.
  {
    name: "unity",
    description: "Unity Unrestricted Agent (Mistral Small 3.1)",
    handler: unityMistralLarge,
    provider: "Cloudflare",
    uncensored: true,
    tier: "flower",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "mirexa",
    description: "Mirexa AI Companion (GPT-4.1)",
    handler: generateTextMirexa,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "midijourney",
    description: "Midijourney",
    handler: midijourney,
    provider: "Azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
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
  },
  {
    name: "elixposearch",
    description: "ElixpoSearch - Custom search-enhanced AI model",
    handler: generateTextPortkey,
    provider: "Scaleway",
    tier: "seed",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
  },
  {
    name: "sur",
    description: "Sur AI Assistant (Mistral)",
    handler: surMistral,
    provider: "Cloudflare",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "bidara",
    description: "BIDARA - Biomimetic Designer and Research Assistant by NASA",
    handler: bidara,
    provider: "Azure",
    tier: "seed",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
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
    // Add pricing based on provider
    if (model.provider === "Cloudflare" && model.name.toLowerCase().includes("mistral")) {
      model.pricing = {
        prompt_tokens: 0.1,    // $0.1 per 1M input tokens (Mistral Small models)
        completion_tokens: 0.3,  // $0.3 per 1M output tokens (Mistral Small models)
        cached_tokens: 0.025,
      };
    } else {
      model.pricing = {
        prompt_tokens: 1.0,    // Default $1 per 1M input tokens
        completion_tokens: 3.0,  // Default $3 per 1M output tokens
        cached_tokens: 0.25,
      };
    }
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
    prompt_tokens: 1.0,    // Default $1 per 1M input tokens
    completion_tokens: 3.0,    // Default $3 per 1M output tokens
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
