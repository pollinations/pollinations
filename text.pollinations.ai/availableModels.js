// Import all handler functions
import { generateTextSearch } from "./generateTextSearch.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { generateTextMistral } from "./generateTextMistral.js";

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
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4.1-mini",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "openai-fast",
    description: "GPT-4.1-nano",
    handler: generateTextPortkey,
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    tier: "anonymous",
    community: false,
    aliases: "gpt-4.1-nano",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "openai-large",
    description: "GPT-4.1",
    handler: generateTextPortkey,
    //    details: "Delivers enhanced performance for high-quality text and image analysis.",
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4.1",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    //    details: "Tailored for coding tasks with efficient code generation and debugging support.",
    provider: "Scaleway",
    tier: "anonymous",
    community: false,
    aliases: "qwen2.5-coder-32b-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "llamascout",
    description: "Llama 4 Scout 17B",
    handler: generateTextPortkey,
    //    details: "Llama 4 Scout model optimized for efficient text generation.",
    provider: "Cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "llama-4-scout-17b-16e-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "mistral",
    description: "Mistral Small 3.1 24B",
    handler: generateTextPortkey,
    //    details:  "Efficient language generation focused on speed and clarity.",
    provider: "Cloudflare",
    tier: "anonymous",
    community: false,
    aliases: "mistral-small-3.1-24b-instruct",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "unity",
    description: "Unity Unrestricted Agent (Mistral Small 3.1)",
    handler: unityMistralLarge,
    //    details:  "Uncensored.",
    provider: "Cloudflare",
    uncensored: true,
    tier: "seed",
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
    //    details:  "Generates creative musical compositions from text prompts in ABC notation.",
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
    //    details:  "Image generation assistant by @Bqrio.",
    provider: "Azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "searchgpt",
    description: "searchgpt",
    handler: generateTextSearch,
    //    details:  "Integrates real-time search results for responses.",
    provider: "Azure",
    tier: "seed",
    community: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    //    details:  "Experimental mode for unfiltered and creatively diverse outputs.",
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
    //    details:  "Combines distilled reasoning with advanced contextual understanding.",
    reasoning: true,
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-r1-0528",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
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
    //    details:  "Reliable model for precise instruction following and robust responses.",
    provider: "Azure",
    tier: "anonymous",
    community: false,
    aliases: "phi-4-mini-instruct",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    //    details:  "Self-help assistant offering therapeutic guidance and advice.",
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
    //    details:  "Advanced language model with comprehensive understanding capabilities.",
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "deepseek-v3",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "grok",
    description: "xAi Grok-3 Mini",
    handler: generateTextPortkey,
    //    details:  "Grok model from xAI hosted on Azure, known for its conversational abilities and reasoning.",
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "grok-3-mini",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "sur",
    description: "Sur AI Assistant (Mistral)",
    handler: surMistral,
    //    details:  "Sur assistant powered by Mistral architecture for enhanced capabilities.",
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
    //    details:  "Expert in biomimicry, biology, engineering, and design for sustainable solutions.",
    provider: "Azure",
    tier: "anonymous",
    community: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
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
    //    details:  "Audio-focused variant delivering rich auditory and textual content.",
    provider: "Azure",
    tier: "seed",
    community: false,
    aliases: "gpt-4o-audio-preview",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
  },
];

// Sort models alphabetically by name at module level for consistency
const sortedModels = models.sort((a, b) => a.name.localeCompare(b.name));

// Now export the processed models with proper functional approach
export const availableModels = sortedModels.map((model) => {
  const inputs = model.input_modalities || [];
  const outputs = model.output_modalities || [];

  return {
    ...model,
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
