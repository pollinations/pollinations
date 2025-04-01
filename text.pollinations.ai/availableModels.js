// Import all handler functions
import { generateDeepseek } from "./generateDeepseek.js";
import { generateTextSearch } from "./generateTextSearch.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { generateTextPixtral } from "./generateTextPixtral.js";
import { generateTextMistral } from "./generateTextMistral.js";

// Import wrapped models from the new file
import {
  surMistral,
  hypnosisTracy,
  unityMistralLarge,
  midijourney,
  rtist,
  evilCommandR as evilMistral,
} from "./wrappedModels.js";

// Define model handlers
const handlers = {
  openai: generateTextPortkey,
  deepseek: (messages, options) =>
    generateDeepseek(messages, { ...options, model: "deepseek-chat" }),
  mistral: generateTextMistral,
  mistralRoblox: (messages, options) =>
    generateTextPortkey(messages, { ...options, model: "mistral" }),
  portkey: generateTextPortkey,
};

const models = [
  {
    name: "openai",
    description: "OpenAI GPT-4o-mini",
    handler: generateTextPortkey,
    //    details:  "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4o",
    handler: generateTextPortkey,
    //    details: "Delivers enhanced performance for high-quality text and image analysis.",
    provider: "Azure",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "openai-reasoning",
    description: "OpenAI o3-mini",
    handler: generateTextPortkey,
    //    details: "Specialized for advanced reasoning and complex multi-step problem solving.",
    reasoning: true,
    provider: "Azure",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    //    details: "Tailored for coding tasks with efficient code generation and debugging support.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llama",
    description: "Llama 3.3 70B",
    handler: generateTextPortkey,
    //    details: "Versatile language model suited for a wide range of text applications.",
    provider: "Cloudflare",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "mistral",
    description: "Mistral Small 3",
    handler: generateTextMistral,
    //    details:  "Efficient language generation focused on speed and clarity.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "unity",
    description: "Unity Mistral Large",
    handler: unityMistralLarge,
    //    details:  "Uncensored.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "midijourney",
    description: "Midijourney",
    handler: midijourney,
    //    details:  "Generates creative musical compositions from text prompts in ABC notation.",
    provider: "Azure",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "rtist",
    description: "Rtist",
    handler: rtist,
    //    details:  "Image generation assistant by @Bqrio.",
    provider: "Azure",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "searchgpt",
    description: "SearchGPT",
    handler: generateTextSearch,
    //    details:  "Integrates real-time search results for responses.",
    provider: "Azure",

    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    //    details:  "Experimental mode for unfiltered and creatively diverse outputs.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek-R1 Distill Qwen 32B",
    handler: generateTextPortkey,
    //    details:  "Combines distilled reasoning with advanced contextual understanding.",
    reasoning: true,
    provider: "Cloudflare",
    aliases: "deepseek-r1",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek-reasoning-large",
    description: "DeepSeek R1 - Llama 70B",
    handler: generateTextPortkey,
    //    details:  "Leverages Llama 70B architecture for efficient reasoning and cost-effectiveness.",
    reasoning: true,
    provider: "Scaleway",

    aliases: "deepseek-r1-llama",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llamalight",
    description: "Llama 3.1 8B Instruct",
    handler: generateTextPortkey,
    //    details:  "Lightweight model designed for rapid instruction following.",
    provider: "Cloudflare",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "phi",
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    //    details:  "Reliable model for precise instruction following and robust responses.",
    provider: "Cloudflare",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["text"],
  },
  {
    name: "llama-vision",
    description: "Llama 3.2 11B Vision",
    handler: generateTextPortkey,
    //    details:  "Integrates visual inputs with text generation for multimodal tasks.",
    provider: "Cloudflare",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "pixtral",
    description: "Pixtral 12B",
    handler: generateTextPixtral,
    //    details:  "Multimodal transformer delivering concise text outputs from visual inputs.",
    provider: "Scaleway",

    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "gemini",
    description: "Gemini 2.0 Flash",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini" }),
    //    details:  "High-performance model with capabilities in audio and text generation.",
    provider: "Azure",

    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "gemini-reasoning",
    description: "Gemini 2.0 Flash Thinking",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini-thinking" }),
    //    details:  "Enhanced reasoning model with integrated multimodal output.",
    reasoning: true,
    provider: "Azure",
    aliases: "gemini-thinking",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "hormoz",
    description: "Hormoz 8b",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "hormoz" }),
    //    details:  "Uncensored model.",
    provider: "Modal",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    //    details:  "Self-help assistant offering therapeutic guidance and advice.",
    provider: "Azure",
    input_modalities: ["text", "audio"],
    output_modalities: ["audio", "text"],
  },
  {
    name: "mistral-roblox",
    description: "Mistral Roblox on Scaleway",
    handler: handlers.mistralRoblox,
    //    details:  "Optimized Mistral model for Roblox-related tasks.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "roblox-rp",
    description: "Roblox Roleplay Assistant",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "roblox-rp" }),
    //    details:  "Specialized assistant for Roblox roleplay scenarios.",
    provider: "Azure",

    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek",
    description: "DeepSeek-V3",
    handler: handlers.deepseek,
    //    details:  "Advanced language model with comprehensive understanding capabilities.",
    provider: "DeepSeek",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek R1 - Full",
    handler: generateDeepseek,
    //    details:  "Complete reasoning model with enhanced analytical capabilities.",
    provider: "DeepSeek",
    reasoning: true,
    aliases: "deepseek-reasoner",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "qwen-reasoning",
    description: "Qwen QWQ 32B - Advanced Reasoning",
    handler: generateTextPortkey,
    //    details:  "Specialized reasoning model from Qwen optimized for complex problem-solving.",
    provider: "Groq",
    reasoning: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llamaguard",
    description: "Llamaguard 7B AWQ",
    handler: generateTextPortkey,
    //    details:  "Safety-focused model for content moderation and protection.",
    provider: "Cloudflare",
    uncensored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "phi-mini",
    description: "Phi-4 Mini Instruct",
    handler: generateTextPortkey,
    //    details:  "Lightweight version of Phi-4 optimized for efficiency.",
    provider: "Azure",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "sur",
    description: "Sur AI Assistant (Mistral)",
    handler: surMistral,
    //    details:  "Sur assistant powered by Mistral architecture for enhanced capabilities.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llama-scaleway",
    description: "Llama (Scaleway)",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "llama-scaleway" }),
    //    details:  "Llama model hosted on Scaleway infrastructure for reliable performance.",
    provider: "Scaleway",
    uncensored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
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
    //    details:  "Audio-focused variant delivering rich auditory and textual content.",
    provider: "Azure",
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
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
