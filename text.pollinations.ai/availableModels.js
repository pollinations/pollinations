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
	{
		name: "qwen-coder",
		description: "Qwen 2.5 Coder 32B",
		handler: generateTextPortkey,
		provider: "scaleway",
		tier: "anonymous",
		community: false,
		aliases: "qwen2.5-coder-32b-instruct",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.9,
			completion_text: 0.9,
		},
	},
	{
		name: "llamascout",
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
	{
		name: "grok",
		description: "xAI Grok-3 Mini",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "seed",
		community: false,
		aliases: "grok-3-mini",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt_text: 0.275,
			completion_text: 1.38,
		},
	},
	{
		name: "openai-audio",
		description: "OpenAI GPT-4o Mini Audio Preview",
		maxInputChars: 5000,
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
	{
		name: "glm",
		description: "GLM-4 9B Chat (Intelligence.io)",
		handler: generateTextPortkey,
		provider: "intelligence",
		tier: "anonymous",
		community: false,
		aliases: "glm-4-9b-chat",
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
		pricing: {
			prompt: 0.1,
			completion: 0.3,
		},
	},

	// All community models - Reuse upstream endpoints
	{
		name: "unity",
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
	{
		name: "hypnosis-tracy",
		description: "Hypnosis Tracy",
		handler: hypnosisTracy,
		provider: "azure",
		tier: "seed",
		community: true,
		input_modalities: ["text", "audio"],
		output_modalities: ["audio", "text"],
		tools: true,
		pricing: {
			prompt_text: 0.141,
			prompt_audio: 9.3953,
			completion_text: 0.563718,
			completion_audio: 18.790571,
		},
	},
	{
		name: "sur",
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
		description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
		handler: bidara,
		// openai-large
		provider: "azure",
		tier: "anonymous",
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
