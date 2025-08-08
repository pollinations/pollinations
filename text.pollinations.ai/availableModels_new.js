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
		original_name: "gpt-4.1-nano-2025-04-14",
		description: "OpenAI GPT-4.1 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: "gpt-4.1-nano",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.09,
			prompt_cache: 0.03,
			completion_text: 0.35,
		},
	},
	{
		name: "openai-fast",
		original_name: "gpt-4.1-nano-2025-04-14",	
		description: "OpenAI GPT-4.1 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: "gpt-4.1-nano",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.09,
			prompt_cache: 0.03,
			completion_text: 0.35,
		},
	},
	{
		name: "openai-large",
		original_name: "gpt-4.1-2025-04-14", 
		description: "OpenAI GPT-4.1",
		maxInputChars: 9000,
		handler: generateTextPortkey,
		provider: "azure",
		tier: "flower",
		community: false,
		aliases: "gpt-4.1",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 1.71,
			prompt_cache: 0.43,
			completion_text: 6.84,
		},
	},
	{
		name: "openai-roblox",
		original_name: "gpt-4.1-nano-2025-04-14",
		description: "OpenAI GPT-4.1 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: "gpt-4.1-nano",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.09,
			prompt_cache: 0.03,
			completion_text: 0.35,
		},
	},
	// {
	// 	name: "openai-reasoning",
	// 	description:
	// 		"OpenAI O3 (provided by hcap.ai - https://discord.gg/hTwkYTry)",
	// 	handler: generateTextPortkey,
	// 	reasoning: true,
	// 	provider: "chatwithmono.xyz",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "o3",
	// 	input_modalities: ["text", "image"],
	// 	output_modalities: ["text"],
	// 	pricing: {
	// 		prompt_text: 2.0,
	// 		prompt_cache: 0.5,
	// 		completion_text: 8.0,
	// 	},
	// },
	// {
	//   name: "searchgpt",
	//   description: "OpenAI GPT-4o Mini Search Preview (provided by chatwithmono.xyz)",
	//   handler: generateTextPortkey,
	//   search: true,
	//   provider: "chatwithmono.xyz",
	//   tier: "anonymous",
	//   community: false,
	//   aliases: "gpt-4o-mini-search",
	//   input_modalities: ["text"],
	//   output_modalities: ["text"],
	//   tools: true,
	//   pricing: {
	//     prompt: 0.15,
	//     completion: 0.6,
	//     cache: 0.0375,
	//   },
	// },
	// {
	// 	name: "qwen-coder",
	// 	original_name: null, // To be determined from API response
	// 	description: "Qwen 2.5 Coder 32B",
	// 	handler: generateTextPortkey,
	// 	provider: "scaleway",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "qwen2.5-coder-32b-instruct",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: true,
	// 	pricing: {
	// 		prompt_text: 0.9,
	// 		completion_text: 0.9,
	// 	},
	// },
	{
		name: "qwen",
		original_name: "Qwen/Qwen3-30B-A3B", // To be determined from API response
		description: "Qwen 3 30B A3B",
		handler: generateTextPortkey,
		provider: "nebius",
		tier: "anonymous",
		community: false,
		aliases: "qwen3-30b-a3b",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.3,
			completion_text: 0.9,
		},
	},
	{
		name: "llamascout",
		original_name: "@cf/meta/llama-4-scout-17b-16e-instruct",
		description: "Llama 4 Scout 17B",
		handler: generateTextPortkey,
		provider: "cloudflare",
		tier: "anonymous",
		community: false,
		aliases: "llama-4-scout-17b-16e-instruct",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: false,
		pricing: {
			prompt_text: 0.27,
			completion_text: 0.85,
		},
	},
	{
		name: "llama-roblox",
		original_name: "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
		description: "Llama 3.1 8B Instruct (Nebius)",
		handler: generateTextPortkey,
		provider: "nebius",
		tier: "anonymous",
		community: false,
		aliases: "llama-3.1-8b-instruct",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.03,
			completion_text: 0.09,
		},
	},
	{
		name: "mistral-nemo-roblox",
		original_name: "mistralai/Mistral-Nemo-Instruct-2407",
		description: "Mistral Nemo Instruct 2407 (Nebius)",
		handler: generateTextPortkey,
		provider: "nebius",
		tier: "anonymous",
		community: false,
		aliases: "mistral-nemo-instruct-2407",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.04,
			completion_text: 0.12,
		},
	},
	// {
	// 	name: "gemma-roblox",
	// 	description: "Gemma 2 9B IT Fast (Nebius)",
	// 	handler: generateTextPortkey,
	// 	provider: "nebius",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "gemma-2-9b-it-fast",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: true,
	// 	pricing: {
	// 		prompt_text: 0.03,
	// 		completion_text: 0.09,
	// 	},
	// },
	{
		name: "llama-fast-roblox",
		original_name: "@cf/meta/llama-3.2-11b-vision-instruct",
		description: "Llama 3.2 1B",
		handler: generateTextPortkey,
		provider: "cloudflare",
		tier: "anonymous",
		community: false,
		aliases: "llama-3.2-1b-instruct",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.027,
			completion_text: 0.201,
		},
	},
	{
		name: "mistral",
		original_name: "mistral-small-3.1-24b-instruct-2503",
		description: "Mistral Small 3.1 24B",
		handler: generateTextPortkey,
		provider: "scaleway",
		tier: "anonymous",
		community: false,
		aliases: "mistral-small-3.1-24b-instruct",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.15,
			completion_text: 0.35,
		},
	},
	{
		name: "mistral-roblox",
		original_name: "@cf/mistralai/mistral-small-3.1-24b-instruct",
		description: "Mistral Small 3.1 24B",
		handler: generateTextPortkey,
		provider: "cloudflare",
		tier: "anonymous",
		community: false,
		aliases: "mistral-small-cloudflare",
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.351,
			completion_text: 0.555,
		},
	},
	{
		name: "deepseek-reasoning",
		original_name: "deepseek-ai/DeepSeek-R1-0528",
		description: "DeepSeek R1 0528",
		maxInputChars: 10000,
		handler: generateTextPortkey,
		reasoning: true,
		provider: "azure",
		tier: "seed",
		community: false,
		aliases: "deepseek-r1-0528",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: false,
		pricing: {
			prompt_text: 1.269,
			completion_text: 5.08,
		},
	},
	// {
	// 	name: "phi",
	// 	description: "Phi-4 Mini Instruct",
	// 	handler: generateTextPortkey,
	// 	provider: "azure",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "phi-4-mini-instruct",
	// 	input_modalities: ["text", "image", "audio"],
	// 	output_modalities: ["text"],
	// 	tools: false,
	// 	pricing: {
	// 		prompt_text: 0.075,
	// 		prompt_audio: 0.075,
	// 		completion_text: 0.3,
	// 	},
	// },
	// {
	// 	name: "deepseek",
	// 	description: "DeepSeek V3",
	// 	maxInputChars: 9000,
	// 	handler: generateTextPortkey,
	// 	provider: "azure",
	// 	tier: "flower",
	// 	community: false,
	// 	aliases: "deepseek-v3",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: false,
	// 	pricing: {
	// 		prompt_text: 1.25,
	// 		completion_text: 5.0,
	// 	},
	// },
	// {
	// 	name: "grok",
	// 	original_name: null, // To be determined from API response
	// 	description: "xAI Grok-3 Mini",
	// 	handler: generateTextPortkey,
	// 	provider: "azure",
	// 	tier: "seed",
	// 	community: false,
	// 	aliases: "grok-3-mini",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: true,
	// 	pricing: {
	// 		prompt_text: 0.275,
	// 		completion_text: 1.38,
	// 	},
	// },
	{
		name: "openai-audio",
		original_name: "gpt-4o-mini-audio-preview-2024-12-17", 
		description: "OpenAI GPT-4o Mini Audio Preview",
		maxInputChars: 2000,
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
		provider: "azure",
		tier: "seed",
		community: false,
		aliases: "gpt-4o-mini-audio-preview",
		input_modalities: ["text", "image", "audio"],
		output_modalities: ["audio", "text"],
		tools: true,
		pricing: {
			prompt_text: 0.141,
			prompt_audio: 9.3953,
			completion_text: 0.563718,
			completion_audio: 18.790571,
		},
	},
	// {
	// 	name: "glm",
	// 	original_name: null, // To be determined from API response
	// 	description: "GLM-4 9B Chat (Intelligence.io)",
	// 	handler: generateTextPortkey,
	// 	provider: "intelligence",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "glm-4-9b-chat",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: true,
	// 	pricing: {
	// 		prompt: 0.1,
	// 		completion: 0.3,
	// 	},
	// },

	// All community models - Reuse upstream endpoints
	{
		name: "unity",
		original_name: "mistral-small-3.1-24b-instruct-2503",
		description: "Unity Unrestricted Agent",
		handler: unityMistralLarge,
		// mistral
		provider: "scaleway",
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.15,
			completion_text: 0.35,
		},
	},
	{
		name: "mirexa",
		original_name: "gpt-4.1-2025-04-14", 
		description: "Mirexa AI Companion",
		handler: generateTextMirexa,
		// openai-large
		provider: "azure",
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 1.71,
			prompt_cache: 0.43,
			completion_text: 6.84,
		},
	},
	{
		name: "midijourney",
		original_name: "gpt-4.1-2025-04-14",
		description: "MIDIjourney",
		handler: midijourney,
		// openai-large
		provider: "azure",
		tier: "anonymous",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 1.71,
			prompt_cache: 0.43,
			completion_text: 6.84,
		},
	},
	{
		name: "rtist",
		original_name: "gpt-4.1-2025-04-14", 
		description: "Rtist",
		handler: rtist,
		// openai-large
		provider: "azure",
		tier: "seed",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 1.71,
			prompt_cache: 0.43,
			completion_text: 6.84,
		},
	},
	{
		name: "evil",
		original_name: "mistral-small-3.1-24b-instruct-2503",
		description: "Evil",
		handler: evilMistral,
		// mistral
		provider: "scaleway",
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.15,
			completion_text: 0.35,
		},
	},
	{
		name: "elixposearch",
		original_name: "gpt-4.1-nano-2025-04-14", 
		description: "Elixpo Search",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: false,
		pricing: {
			prompt_text: 0.09,
			prompt_cache: 0.03,
			completion_text: 0.35,
		},
	},
	// {
	// 	name: "hypnosis-tracy",
	// 	original_name: "gpt-4o-mini-audio-preview-2024-12-17",
	// 	description: "Hypnosis Tracy",
	// 	handler: hypnosisTracy,
	// 	provider: "azure",
	// 	tier: "seed",
	// 	community: true,
	// 	input_modalities: ["text", "audio"],
	// 	output_modalities: ["audio", "text"],
	// 	tools: true,
	// 	pricing: {
	// 		prompt_text: 0.141,
	// 		prompt_audio: 9.3953,
	// 		completion_text: 0.563718,
	// 		completion_audio: 18.790571,
	// 	},
	// },
	{
		name: "sur",
		original_name: "mistral-small-3.1-24b-instruct-2503",
		description: "Sur AI Assistant",
		handler: surMistral,
		// mistral
		provider: "scaleway",
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.15,
			completion_text: 0.35,
		},
	},
	{
		name: "bidara",
		original_name: "gpt-4.1-2025-04-14",
		description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
		handler: bidara,
		// openai-fast
		provider: "azure",
		tier: "anonymous",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.09,
			prompt_cache: 0.03,
			completion_text: 0.35,
		},
	},
];

// Use the models array directly without sorting
const unsortedModels = models;

// Define default pricing values
const DEFAULT_PRICING = { prompt: 1, completion: 4, cache: 0.25 };

// Set default pricing using functional approach
const modelsWithPricing = unsortedModels.map((model) => ({
	...model,
	pricing: {
		...DEFAULT_PRICING,
		...model.pricing,
	},
}));

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

// Default pricing is now automatically applied to all models in the modelsWithPricing array

/**
 * Find a model by name
 * @param {string} modelName - The name of the model to find
 * @returns {Object|null} - The model object or null if not found
 */
export function findModelByName(modelName) {
	return (
		availableModels.find(
			(model) => model.name === modelName || model.aliases === modelName,
		) || availableModels.find((model) => model.name === "openai-fast")
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
