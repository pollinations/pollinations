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
			prompt_text: 0.10,
			prompt_cache: 0.03,
			completion_text: 0.39,
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
			prompt_text: 1.91,
			prompt_cache: 0.48,
			completion_text: 7.64,
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
	},
	{
		name: "qwen-coder",
		original_name: "qwen2.5-coder-32b-instruct",
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
		description: "Llama 3.1 8B Instruct",
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
		description: "Mistral Nemo Instruct 2407",
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
			prompt_text: 0.049,
			completion_text: 0.68,
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
		input_modalities: ["text"],
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
			prompt_text: 0.35,
			completion_text: 0.56,
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
			prompt_text: 1.485,
			completion_text: 5.94,
		},
	},
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
			prompt_text: 0.1432,
			prompt_audio: 9.5466,
			completion_text: 0.572793,
			completion_audio: 19.093079,
		},
	},


	// community models - use upstream endpoints
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
	},
	{
		name: "unity",
		description: "Unity Unrestricted Agent",
		handler: unityMistralLarge,		provider: "scaleway",
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
	},
	{
		name: "mirexa",
		description: "Mirexa AI Companion",
		handler: generateTextMirexa,
		provider: "azure",
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
	},
	{
		name: "midijourney",
		description: "MIDIjourney",
		handler: midijourney,
		provider: "azure",
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
		provider: "azure",
		tier: "seed",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true,
	},
	{
		name: "evil",
		description: "Evil",
		handler: evilMistral,
		provider: "scaleway",
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
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
	},
	{
		name: "sur",
		description: "Sur AI Assistant",
		handler: surMistral,
		provider: "scaleway",
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
	},
	{
		name: "bidara",
		description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
		handler: bidara,
		provider: "azure",
		tier: "anonymous",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
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
