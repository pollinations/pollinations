// Import all handler functions
import { generateDeepseek } from "./generateDeepseek.js";
import { generateTextSearch } from "./generateTextSearch.js";
import { generateTextPortkey } from "./generateTextPortkey.js";
import { generateTextPixtral } from "./generateTextPixtral.js";
import wrapModelWithContext from "./wrapModelWithContext.js";
import wrapModelWithDonationMessage from "./modelDonationWrapper.js";

// Import persona prompts
import surSystemPrompt from "./personas/sur.js";
import unityPrompt from "./personas/unity.js";
import midijourneyPrompt from "./personas/midijourney.js";
import rtistPrompt from "./personas/rtist.js";
import evilPrompt from "./personas/evil.js";
import hypnosisTracyPrompt from "./personas/hypnosisTracy.js";

// Create wrapped models
const surOpenai = wrapModelWithContext(
  surSystemPrompt,
  generateTextPortkey,
  "openai"
);
const surMistral = wrapModelWithContext(
  surSystemPrompt,
  generateTextPortkey,
  "mistral"
);
const hypnosisTracy = wrapModelWithContext(
  hypnosisTracyPrompt,
  generateTextPortkey,
  "openai-audio"
);
const unityMistralLarge = wrapModelWithContext(
  unityPrompt,
  generateTextPortkey,
  "mistral"
);
const midijourney = wrapModelWithContext(
  midijourneyPrompt,
  generateTextPortkey,
  "openai-large"
);
const rtist = wrapModelWithContext(
  rtistPrompt,
  generateTextPortkey,
  "openai-large"
);
const evilCommandR = wrapModelWithContext(
  evilPrompt,
  generateTextPortkey,
  "mistral"
);

// Define model handlers
const handlers = {
  openai: (messages, options) =>
    generateTextPortkey(messages, { ...options, model: "openai" }),
  deepseek: (messages, options) =>
    generateDeepseek(messages, { ...options, model: "deepseek-chat" }),
  mistral: (messages, options) =>
    generateTextPortkey(messages, { ...options, model: "mistral" }),
  portkey: (messages, options, model) =>
    generateTextPortkey(messages, { ...options, model }),
  openai: (messages, options) =>
    generateTextPortkey(messages, { ...options, model: "openai" }),
  deepseek: (messages, options) =>
    generateDeepseek(messages, { ...options, model: "deepseek-chat" }),
  mistral: (messages, options) =>
    generateTextPortkey(messages, { ...options, model: "mistral" }),
  openRouter: (messages, options, model) =>
    generateTextOpenRouter(messages, { ...options, model }),
  modal: (messages, options) => generateTextModal(messages, options),
  portkey: (messages, options, model) =>
    generateTextPortkey(messages, { ...options, model }),
};

// Define models first
const models = [
  {
    name: "openai",
    description: "OpenAI GPT-4o-mini",
    handler: generateTextPortkey,
    details: "Optimized for fast and cost-effective text and image processing.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "openai-large",
    description: "OpenAI GPT-4o",
    handler: generateTextPortkey,
    details:
      "Delivers enhanced performance for high-quality text and image analysis.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "openai-reasoning",
    description: "OpenAI o3-mini",
    handler: generateTextPortkey,
    details:
      "Specialized for advanced reasoning and complex multi-step problem solving.",
    available: true,
    reasoning: true,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "qwen-coder",
    description: "Qwen 2.5 Coder 32B",
    handler: generateTextPortkey,
    details:
      "Tailored for coding tasks with efficient code generation and debugging support.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "llama",
    description: "Llama 3.3 70B",
    handler: generateTextPortkey,
    details:
      "Versatile language model suited for a wide range of text applications.",
    available: true,
    reasoning: false,
    provider: "Cloudflare",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "mistral",
    description: "Mistral Nemo",
    handler: handlers.mistral,
    details: "Efficient language generation focused on speed and clarity.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "unity",
    description: "Unity Mistral Large",
    handler: unityMistralLarge,
    details:
      "Robust performance in language tasks using scaled Mistral architecture.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "midijourney",
    description: "Midijourney",
    handler: midijourney,
    details: "Generates creative musical compositions from text prompts.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["audio"],
    tools: false,
  },
  {
    name: "rtist",
    description: "Rtist",
    handler: rtist,
    details: "Produces high-quality images from artistic text prompts.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["image"],
    tools: false,
  },
  {
    name: "searchgpt",
    description: "SearchGPT",
    handler: generateTextSearch,
    details:
      "Integrates real-time web data for contextually relevant responses.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "evil",
    description: "Evil",
    handler: evilCommandR,
    details: "Experimental mode for unfiltered and creatively diverse outputs.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "deepseek",
    description: "DeepSeek-V3",
    handler: handlers.deepseek,
    details: "Context-aware search model for deep semantic retrieval.",
    available: true,
    reasoning: false,
    provider: "DeepSeek",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "claude",
    description: "Claude 3.5 Haiku",
    handler: wrapModelWithDonationMessage(
      (messages, options) =>
        generateTextPortkey(messages, { ...options, model: "claude" }),
      "Claude 3.5 Haiku",
      { threshold: 50, currentDonations: 47 }
    ),
    details: "Optimized for generating engaging and witty creative text.",
    available: true,
    reasoning: false,
    provider: "Anthropic",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "deepseek-r1",
    description: "DeepSeek-R1 Distill Qwen 32B",
    handler: generateTextPortkey,
    details:
      "Combines distilled reasoning with advanced contextual understanding.",
    available: true,
    reasoning: true,
    provider: "Cloudflare",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "deepseek-reasoning",
    description: "DeepSeek R1 - Full",
    handler: generateDeepseek,
    details: "Advanced reasoning engine for detailed and context-rich outputs.",
    available: true,
    reasoning: true,
    provider: "DeepSeek",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "deepseek-r1-llama",
    description: "DeepSeek R1 - Llama 70B",
    handler: generateTextPortkey,
    details:
      "Leverages Llama 70B architecture for efficient reasoning and cost-effectiveness.",
    available: true,
    reasoning: true,
    provider: "Scaleway",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "llamalight",
    description: "Llama 3.1 8B Instruct",
    handler: generateTextPortkey,
    details: "Lightweight model designed for rapid instruction following.",
    available: true,
    reasoning: false,
    provider: "Cloudflare",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "llamaguard",
    description: "Llamaguard 7B AWQ",
    handler: generateTextPortkey,
    details:
      "Balances performance with resource efficiency for general applications.",
    available: true,
    reasoning: false,
    provider: "Cloudflare",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "phi",
    description: "Phi-4 Instruct",
    handler: generateTextPortkey,
    details:
      "Reliable model for precise instruction following and robust responses.",
    available: true,
    reasoning: false,
    provider: "Cloudflare",
    censored: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "llama-vision",
    description: "Llama 3.2 11B Vision",
    handler: generateTextPortkey,
    details:
      "Integrates visual inputs with text generation for multimodal tasks.",
    available: true,
    reasoning: false,
    provider: "Cloudflare",
    censored: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "pixtral",
    description: "Pixtral 12B",
    handler: generateTextPixtral,
    details:
      "Multimodal transformer delivering concise text outputs from visual inputs.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    tools: false,
  },
  {
    name: "gemini",
    description: "Gemini 2.0 Flash",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini" }),
    details:
      "High-performance model with capabilities in audio and text generation.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "gemini-reasoning",
    description: "Gemini 2.0 Flash Thinking",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "gemini-thinking" }),
    details: "Enhanced reasoning model with integrated multimodal output.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "hormoz",
    description: "Hormoz 8b",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "hormoz" }),
    details: "Creative model supporting diverse multimodal inputs and outputs.",
    available: true,
    reasoning: false,
    provider: "Modal",
    censored: false,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "hypnosis-tracy",
    description: "Hypnosis Tracy 7B",
    handler: hypnosisTracy,
    details: "Self-help assistant offering therapeutic guidance and advice.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: false,
    input_modalities: ["text"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "sur",
    description: "Sur AI Assistant",
    handler: surOpenai,
    details:
      "General-purpose AI assistant with balanced text and image processing.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "sur-mistral",
    description: "Sur AI Assistant Mistral",
    handler: surMistral,
    details:
      "Variant leveraging Mistral architecture for improved language understanding.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
  },
  {
    name: "llama-scaleway",
    description: "Llama Scaleway",
    handler: (messages, options) =>
      generateTextPortkey(messages, { ...options, model: "llama-scaleway" }),
    details:
      "Optimized Llama model deployed on Scaleway for efficient task handling.",
    available: true,
    reasoning: false,
    provider: "Scaleway",
    censored: false,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
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
    details:
      "Audio-focused variant delivering rich auditory and textual content.",
    available: true,
    reasoning: false,
    provider: "Azure",
    censored: true,
    input_modalities: ["text", "image"],
    output_modalities: ["audio", "text"],
    tools: false,
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

// For backward compatibility
export const modelHandlers = {};
availableModels.forEach((model) => {
  if (model.handler) {
    modelHandlers[model.name] = model.handler;
  }
});
