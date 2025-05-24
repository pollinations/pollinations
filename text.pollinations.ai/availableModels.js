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
    description: "OpenAI GPT-4.1-mini",
    handler: generateTextPortkey,
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "openai-fast",
    description: "OpenAI GPT-4.1-nano",
    handler: generateTextPortkey,
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    aliases: "openai-small",
    tools: true,
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4.1",
    handler: generateTextPortkey,
    //    details: "Delivers enhanced performance for high-quality text and image analysis.",
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "openai-roblox",
    description: "OpenAI GPT-4.1-mini for Roblox",
    handler: generateTextPortkey,
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  // {
  //   name: "openai-reasoning",
  //   description: "OpenAI o4-mini",
  //   handler: generateTextPortkey,
  //   //    details: "Specialized for advanced reasoning and complex multi-step problem solving.",
  //   reasoning: true,
  //   provider: "Azure",
  //   vision: true,
  //   input_modalities: ["text", "image"],
  //   output_modalities: ["text"],
  // },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    //    details: "Tailored for coding tasks with efficient code generation and debugging support.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "llama",
    description: "Llama 3.3 70B",
    handler: generateTextPortkey,
    //    details: "Versatile language model suited for a wide range of text applications.",
    provider: "Cloudflare",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "llamascout",
    description: "Llama 4 Scout 17B",
    handler: generateTextPortkey,
    //    details: "Llama 4 Scout model optimized for efficient text generation.",
    provider: "Cloudflare",
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
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "unity",
    description: "Unity Unrestricted Agent (Mistral Small 3.1)",
    handler: unityMistralLarge,
    //    details:  "Uncensored.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "mirexa",
    description: "Mirexa AI Companion (GPT-4.1)",
    handler: generateTextMirexa,
    provider: "Azure",
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
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "searchgpt",
    description: "SearchGPT",
    handler: generateTextSearch,
    //    details:  "Integrates real-time search results for responses.",
    provider: "Azure",

    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    //    details:  "Experimental mode for unfiltered and creatively diverse outputs.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek R1 - MAI-DS-R1",
    handler: generateTextPortkey,
    //    details:  "Combines distilled reasoning with advanced contextual understanding.",
    reasoning: true,
    provider: "Cloudflare",
    aliases: "deepseek-r1",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  // {
  //   name: "deepseek-reasoning-large",
  //   description: "DeepSeek R1 - Llama 70B",
  //   handler: generateTextPortkey,
  //   //    details:  "Leverages Llama 70B architecture for efficient reasoning and cost-effectiveness.",
  //   reasoning: true,
  //   provider: "Scaleway",

  //   aliases: "deepseek-r1-llama",
  //   input_modalities: ["text"],
  //   output_modalities: ["text"],
  // },
  {
    name: "phi",
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    //    details:  "Reliable model for precise instruction following and robust responses.",
    provider: "Azure",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
    tools: false,
  },
  // {
  //   name: "pixtral",
  //   description: "Pixtral 12B",
  //   handler: generateTextPixtral,
  //   //    details:  "Multimodal transformer delivering concise text outputs from visual inputs.",
  //   provider: "Scaleway",

  //   input_modalities: ["text", "image"],
  //   output_modalities: ["text"],
  // },
  // {
  //   name: "gemini",
  //   description: "gemini-2.5-flash-preview-04-17",
  //   handler: generateTextPortkey,
  //   //    details:  "High-performance model with capabilities in audio and text generation.",
  //   provider: "Azure",
  //   input_modalities: ["text", "image", "audio"],
  //   output_modalities: ["audio", "text"],
  // },
  // {
  //   name: "gemini-reasoning",
  //   description: "Gemini 2.0 Flash Thinking",
  //   handler: (messages, options) =>
  //     generateTextPortkey(messages, { ...options, model: "gemini-thinking" }),
  //   //    details:  "Enhanced reasoning model with integrated multimodal output.",
  //   reasoning: true,
  //   provider: "Azure",
  //   aliases: "gemini-thinking",
  //   input_modalities: ["text", "image", "audio"],
  //   output_modalities: ["audio", "text"],
  // },
  {
    name: "hormoz",
    description: "Hormoz 8b",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "hormoz" }),
    //    details:  "Uncensored model.",
    provider: "Modal",
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    //    details:  "Self-help assistant offering therapeutic guidance and advice.",
    provider: "Azure",
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
  },
  {
    name: "deepseek",
    description: "DeepSeek-V3",
    handler: generateTextPortkey,
    //    details:  "Advanced language model with comprehensive understanding capabilities.",
    provider: "DeepSeek",
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
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: true,
  },
  // {
  //   name: "deepseek-reasoning",
  //   description: "DeepSeek R1 - Full",
  //   handler: generateDeepseek,
  //   //    details:  "Complete reasoning model with enhanced analytical capabilities.",
  //   provider: "DeepSeek",
  //   reasoning: true,
  //   aliases: "deepseek-reasoner",
  //   input_modalities: ["text"],
  //   output_modalities: ["text"],
  // },
  // {
  //   name: "qwen-reasoning",
  //   description: "Qwen QWQ 32B - Advanced Reasoning",
  //   handler: generateTextPortkey,
  //   //    details:  "Specialized reasoning model from Qwen optimized for complex problem-solving.",
  //   provider: "Groq",
  //   reasoning: true,
  //   input_modalities: ["text"],
  //   output_modalities: ["text"],
  // },
  {
    name: "sur",
    description: "Sur AI Assistant (Mistral)",
    handler: surMistral,
    //    details:  "Sur assistant powered by Mistral architecture for enhanced capabilities.",
    provider: "Scaleway",
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
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  // {
  //   name: "llama-scaleway",
  //   description: "Llama (Scaleway)",
  //   handler: (messages, options) =>
  //     generateTextPortkey(messages, { ...options, model: "llama-scaleway" }),
  //   //    details:  "Llama model hosted on Scaleway infrastructure for reliable performance.",
  //   provider: "Scaleway",
  //   uncensored: true,
  //   input_modalities: ["text"],
  //   output_modalities: ["text"],
  // },
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
    //    details:  "Audio-focused variant delivering rich auditory and textual content.",
    provider: "Azure",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
    tools: true,
  },
];

// Now export the processed models with proper functional approach
export const availableModels = models.map((model) => {
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
