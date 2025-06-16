// Import all handler functions
// import { generateTextSearch } from "./generateTextSearch.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
// import { generateTextMistral } from "./generateTextMistral.js";

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

// Removed handlers object – call handler functions directly in model definitions

const models = [
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
    token_input: 0.4,
    token_cache: 0.1,
    token_output: 1.6,
    pricing: {
      prompt_tokens: 0.0004,    // $0.0004 per 1K input tokens (GPT-4.1-mini)
      completion_tokens: 0.0016  // $0.0016 per 1K output tokens (GPT-4.1-mini)
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
    token_input: 0.1,
    token_cache: 0.025,
    token_output: 0.4,
    pricing: {
      prompt_tokens: 0.0001,    // $0.0001 per 1K input tokens (GPT-4.1-nano)
      completion_tokens: 0.0004    // $0.0004 per 1K output tokens (GPT-4.1-nano)
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
    token_input: 2.0,
    token_cache: 0.5,
    token_output: 8.0,
    pricing: {
      prompt_tokens: 0.002,    // $0.002 per 1K input tokens (GPT-4.1)
      completion_tokens: 0.008    // $0.008 per 1K output tokens (GPT-4.1)
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
    token_input: 2.0,
    token_cache: 0.5,
    token_output: 8.0,
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
    token_input: 0.15,
    token_cache: 0.0375,
    token_output: 0.6,
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
    token_input: 0.06,
    token_cache: 0.015,
    token_output: 0.15,
    pricing: {
      prompt_tokens: 0.0004,    // $0.0004 per 1K input tokens (Qwen models)
      completion_tokens: 0.0012    // $0.0012 per 1K output tokens (Qwen models)
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
    token_input: 0.18,
    token_cache: 0.045,
    token_output: 0.59,
    pricing: {
      prompt_tokens: 0.00027,    // $0.00027 per 1K input tokens (Llama 4 Scout)
      completion_tokens: 0.00085    // $0.00085 per 1K output tokens (Llama 4 Scout)
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
    token_input: 0.1,
    token_cache: 0.025,
    token_output: 0.3,
    pricing: {
      prompt_tokens: 0.002,
      completion_tokens: 0.006
    },
  },
  // Community models below reuse upstream endpoints – pricing handled upstream, so no token_* metadata added.
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
    token_input: 0.55,
    token_cache: 0.14,
    token_output: 2.19,
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
    token_input: 0.13,
    token_cache: 0.0325,
    token_output: 0.5,
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
    token_input: 0.27,
    token_cache: 0.07,
    token_output: 1.1,
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
    token_input: 0.3,
    token_cache: 0.075,
    token_output: 0.5,
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
    token_input: 2.5,
    token_cache: 1.25,
    token_output: 10.0,
    pricing: {
      prompt_tokens: 0.015,    // $0.015 per 1K input tokens (GPT-4o audio)
      completion_tokens: 0.06    // $0.06 per 1K output tokens (GPT-4o audio)
    },
  },
// Original searchgpt model replaced by the new chatwithmono.xyz version above
// {
//   name: "searchgpt",
//   description: "SearchGPT",
//   handler: generateTextSearch,
//   provider: "Azure",
//   tier: "seed",
//   community: false,
//   input_modalities: ["text", "image"],
//   output_modalities: ["text"],
//   tools: true,
// },
];

// Sort models alphabetically by name at module level for consistency
const sortedModels = models.sort((a, b) => a.name.localeCompare(b.name));

// Consolidate legacy token_* fields into the pricing object and set sane defaults
const modelsWithPricing = sortedModels.map((model) => {
  const { token_input, token_cache, token_output } = model;

  // Ensure that a pricing object exists so we can safely mutate it
  model.pricing = model.pricing || {};

  // Migrate the more accurate legacy pricing values (if present)
  if (token_input !== undefined) {
    model.pricing.prompt_tokens = token_input;
  }

  if (token_output !== undefined) {
    model.pricing.completion_tokens = token_output;
  }

  if (token_cache !== undefined) {
    model.pricing.cached_tokens = token_cache;
  }

  // Remove the deprecated top-level keys
  delete model.token_input;
  delete model.token_cache;
  delete model.token_output;

  // If after migration there is still no pricing data, fall back to sensible defaults
  if (Object.keys(model.pricing).length === 0) {
    if (model.provider === "Cloudflare" && model.name.toLowerCase().includes("mistral")) {
      model.pricing = {
        prompt_tokens: 0.0001,    // $0.0001 per 1K input tokens (Mistral Small models)
        completion_tokens: 0.0003, // $0.0003 per 1K output tokens (Mistral Small models)
        cached_tokens: 0.0001,    // Assume same as prompt by default
      };
    } else {
      model.pricing = {
        prompt_tokens: 0.001,    // Default $0.001 per 1K input tokens
        completion_tokens: 0.003, // Default $0.003 per 1K output tokens
        cached_tokens: 0.001,    // Assume same as prompt by default
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
    ...publicModel,
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
    prompt_tokens: 0.001,    // Default $0.001 per 1K input tokens
    completion_tokens: 0.003    // Default $0.003 per 1K output tokens
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
