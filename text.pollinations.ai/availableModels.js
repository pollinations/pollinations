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

// Now export the processed models with proper functional approach
export const availableModels = sortedModels.map((model) => {
  // Omit internal pricing metadata from the publicly exposed object
  const { token_input, token_cache, token_output, ...publicModel } = model;

  const inputs = publicModel.input_modalities || [];
  const outputs = publicModel.output_modalities || [];

  return {
    ...publicModel,
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
