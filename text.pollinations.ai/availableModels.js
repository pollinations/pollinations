// Import all handler functions
import { generateTextSearch } from "./generateTextSearch.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { generateTextPixtral } from "./generateTextPixtral.js";
import wrapModelWithDonationMessage from "./modelDonationWrapper.js";

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

// Define models first
const models = [
  {
    name: "openai",
    description: "OpenAI GPT-4o-mini",
    handler: generateTextPortkey,
    details: "Optimized for fast and cost-effective text and image processing.",
    provider: "Azure",
    censored: true,
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
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "mistral",
    description: "Mistral Small 3",
    handler: generateTextPortkey,
    details: "Efficient language generation focused on speed and clarity.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "unity",
    description: "Unity Mistral Large",
    handler: unityMistralLarge,
    details: "Uncensored.",
    provider: "Scaleway",
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
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilMistral,
    details: "Experimental mode for unfiltered and creatively diverse outputs.",
    provider: "Scaleway",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  //   {
  //     name: "claude",
  //     description: "Claude 3.5 Haiku",
  //     handler: wrapModelWithDonationMessage(
  //       (messages, options) =>
  //         generateTextPortkey(messages, { ...options, model: "claude" }),
  //       "Claude 3.5 Haiku",
  //       { threshold: 50, currentDonations: 47 }
  //     ),
  //     details: "Optimized for generating engaging and witty creative text.",
  //     provider: "Anthropic",
  //     censored: true,
  //     input_modalities: ["text"],
  //     output_modalities: ["text"],
  //   },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek-R1 Distill Qwen 32B",
    handler: generateTextPortkey,
    details:
      "Combines distilled reasoning with advanced contextual understanding.",
    reasoning: true,
    provider: "Cloudflare",
    censored: true,
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
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "llamalight",
    description: "Llama 3.1 8B Instruct",
    handler: generateTextPortkey,
    details: "Lightweight model designed for rapid instruction following.",
    provider: "Cloudflare",
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  //   {
  //     name: "llamaguard",
  //     description: "Llamaguard 7B AWQ",
  //     handler: generateTextPortkey,
  //     details:
  //       "Balances performance with resource efficiency for general applications.",
  //     provider: "Cloudflare",
  //     input_modalities: ["text"],
  //     output_modalities: ["text"],
  //   },
  {
    name: "phi",
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    details:
      "Reliable model for precise instruction following and robust responses.",
    provider: "Cloudflare",
    censored: true,
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
    input_modalities: ["text"],
    output_modalities: ["text"],
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    details: "Self-help assistant offering therapeutic guidance and advice.",
    provider: "Azure",
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
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
  },
  //   {
  //     name: "llama-scaleway",
  //     description: "Llama Scaleway",
  //     handler: (messages, options) =>
  //       generateTextPortkey(messages, { ...options, model: "llama-scaleway" }),
  //     details:
  //       "Optimized Llama model deployed on Scaleway for efficient task handling.",
  //     provider: "Scaleway",
  //     input_modalities: ["text", "image"],
  //     output_modalities: ["audio", "text"],
  //   },
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
    input_modalities: ["text", "image", "audio"],
    output_modalities: ["audio", "text"],
  },
];

// Now export the processed models with proper functional approach
export const availableModels = models.map((model) => {
  const inputs = model.input_modalities || model.input || [];
  const outputs = model.output_modalities || model.output || [];
  return {
    ...model,
    vision: inputs.includes("image"),
    audio: outputs.includes("audio"),
  };
});

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
  return (
    availableModels.find((model) => model.name === modelName) ||
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
