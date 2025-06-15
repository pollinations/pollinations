// Import all handler functions
import { generateTextSearch } from "./generateTextSearch.js";
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
    pricing: {
      prompt_tokens: 0.0004,    // $0.0004 per 1K input tokens (GPT-4.1-mini)
      completion_tokens: 0.0016  // $0.0016 per 1K output tokens (GPT-4.1-mini)
    },
  },
  {
    name: "openai-fast",
    description: "GPT-4.1-nano",
    handler: generateTextPortkey,
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    community: false,
    aliases: "gpt-4.1-nano",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.0001,    // $0.0001 per 1K input tokens (GPT-4.1-nano)
      completion_tokens: 0.0004    // $0.0004 per 1K output tokens (GPT-4.1-nano)
    },
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
    pricing: {
      prompt_tokens: 0.002,    // $0.002 per 1K input tokens (GPT-4.1)
      completion_tokens: 0.008    // $0.008 per 1K output tokens (GPT-4.1)
    },
  },
  // {
  //   name: "p1",
  //   description: "GPT-4.1 with OptiLLM optimization proxy for enhanced reasoning and performance",
  //   handler: generateTextPortkey,
  //   provider: "azure",
  //   aliases: [],
  //   input_modalities: ["text"],
  //   output_modalities: ["text"], 
  //   tools: true,
  //   pricing: {
  //     prompt_tokens: 0.000005,
  //     completion_tokens: 0.00002
  //   }
  // },
  // {
  //   name: "openai-roblox",
  //   description: "OpenAI GPT-4.1-mini for Roblox",
  //   handler: generateTextPortkey,
  //   provider: "Azure",
  //   input_modalities: ["text", "image"],
  //   output_modalities: ["text"],
  //   tools: true,
  // },
  {
    name: "openai-reasoning",
    description: "OpenAI O3 (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    //    details: "Specialized for advanced reasoning and complex problem solving using the o3 model.",
    reasoning: true,
    provider: "chatwithmono.xyz",
    aliases: "o3,o3-mini",
    community: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "searchgpt",
    description: "OpenAI GPT-4o mini search preview (provided by chatwithmono.xyz)",
    handler: generateTextPortkey,
    search: true,
    provider: "chatwithmono.xyz",
    community: false,
    aliases: "gpt-4o-mini-search",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    //    details: "Tailored for coding tasks with efficient code generation and debugging support.",
    provider: "Scaleway",
    community: false,
    aliases: "qwen2.5-coder-32b-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.0004,    // $0.0004 per 1K input tokens (Qwen models)
      completion_tokens: 0.0012    // $0.0012 per 1K output tokens (Qwen models)
    },
  },
  {
    name: "llamascout",
    description: "Llama 4 Scout 17B",
    handler: generateTextPortkey,
    //    details: "Llama 4 Scout model optimized for efficient text generation.",
    provider: "Cloudflare",
    community: false,
    aliases: "llama-4-scout-17b-16e-instruct",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
    pricing: {
      prompt_tokens: 0.00027,    // $0.00027 per 1K input tokens (Llama 4 Scout)
      completion_tokens: 0.00085    // $0.00085 per 1K output tokens (Llama 4 Scout)
    },
  },
  {
    name: "mistral",
    description: "Mistral Small 3.1 24B",
    handler: generateTextPortkey,
    //    details:  "Efficient language generation focused on speed and clarity.",
    provider: "Cloudflare",
    community: false,
    aliases: "mistral-small-3.1-24b-instruct",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
    pricing: {
      prompt_tokens: 0.002,
      completion_tokens: 0.006
    },
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
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  // Original searchgpt model replaced by the new chatwithmono.xyz version above
  // {
  //   name: "searchgpt",
  //   description: "SearchGPT",
  //   handler: generateTextSearch,
  //   //    details:  "Integrates real-time search results for responses.",
  //   provider: "Azure",
  //   tier: "seed",
  //   community: false,
  //   input_modalities: ["text", "image"],
  //   output_modalities: ["text"],
  //   tools: true,
  // },
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
    pricing: {
      prompt_tokens: 0.015,    // $0.015 per 1K input tokens (GPT-4o audio)
      completion_tokens: 0.06    // $0.06 per 1K output tokens (GPT-4o audio)
    },
  },
];

// Sort models alphabetically by name at module level for consistency
const sortedModels = models.sort((a, b) => a.name.localeCompare(b.name));

// Set default pricing for models without explicit pricing
const modelsWithPricing = sortedModels.map((model) => {
  if (!model.pricing) {
    // Add pricing based on provider
    if (model.provider === "Cloudflare" && model.name.toLowerCase().includes("mistral")) {
      model.pricing = {
        prompt_tokens: 0.0001,    // $0.0001 per 1K input tokens (Mistral Small models)
        completion_tokens: 0.0003  // $0.0003 per 1K output tokens (Mistral Small models)
      };
    } else {
      model.pricing = {
        prompt_tokens: 0.001,    // Default $0.001 per 1K input tokens
        completion_tokens: 0.003  // Default $0.003 per 1K output tokens
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
