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
	bidara
} from "./wrappedModels.js";

const models = [
	{
		name: "openai",
		description: "OpenAI GPT-5 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: ["gpt-5-nano"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "openai-fast",
		description: "OpenAI GPT-4.1 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: ["gpt-4.1-nano"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "openai-large",
		description: "OpenAI GPT-4.1",
		maxInputChars: 5000,
		handler: generateTextPortkey,
		provider: "azure",
		tier: "seed",
		community: false,
		aliases: ["gpt-4.1"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "qwen-coder",
		description: "Qwen 2.5 Coder 32B",
		handler: generateTextPortkey,
		provider: "scaleway",
		tier: "anonymous",
		community: false,
		aliases: ["qwen2.5-coder-32b-instruct"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "mistral",
		description: "Mistral Small 3.1 24B",
		handler: generateTextPortkey,
		provider: "scaleway",
		tier: "anonymous",
		community: false,
		aliases: ["mistral-small-3.1-24b-instruct"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "mistral-romance",
		description: "Mistral Small 2402 (Bedrock) - Romance Companion",
		handler: generateTextPortkey,
		provider: "bedrock",
		tier: "nectar",
		hidden: true,
		aliases: ["mistral-nemo-instruct-2407-romance","mistral-roblox"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "deepseek-reasoning",
		description: "DeepSeek R1 0528 (Bedrock)",
		maxInputChars: 5000,
		handler: generateTextPortkey,
		reasoning: true,
		provider: "bedrock",
		tier: "seed",
		community: false,
		aliases: ["deepseek-r1-0528"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: false
	},
	{
		name: "openai-audio",
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
		aliases: ["gpt-4o-mini-audio-preview"],
		input_modalities: ["text", "image", "audio"],
		output_modalities: ["audio", "text"],
		tools: true
	},
	{
		name: "gpt-5-nano",
		description: "OpenAI GPT-5 Nano",
		handler: generateTextPortkey,
		provider: "azure",
		tier: "anonymous",
		community: false,
		aliases: ["gpt-5-nano"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "nova-fast",
		description: "Amazon Nova Micro (Bedrock)",
		handler: generateTextPortkey,
		provider: "bedrock",
		community: false,
		tier: "anonymous",
		aliases: ["nova-micro-v1"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "roblox-rp",
		description: "Llama 3.1 8B Instruct (Cross-Region Bedrock)",
		handler: generateTextPortkey,
		provider: "bedrock",
		tier: "seed",
		community: false,
		aliases: ["llama-roblox","llama-fast-roblox"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "claudyclaude",
		description: "Claude 3.5 Haiku (Bedrock)",
		handler: generateTextPortkey,
		provider: "bedrock",
		tier: "nectar",
		hidden: true,
		// community: false,
		aliases: ["claude-3-5-haiku"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "openai-reasoning",
		description: "OpenAI o4-mini (api.navy)",
		handler: generateTextPortkey,
		provider: "api.navy",
		tier: "seed",
		community: false,
		aliases: ["o4-mini"],
		reasoning: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "gemini",
		description: "Gemini 2.5 Flash Lite (api.navy)",
		handler: generateTextPortkey,
		provider: "api.navy",
		tier: "anonymous",
		community: false,
		aliases: ["gemini-2.5-flash-lite"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	// {
	// 	name: "geminisearch",
	//
		// 	description: "Gemini 2.5 Flash Lite Search",
	// 	handler: generateTextPortkey,
	// 	provider: "api.navy",
	// 	tier: "anonymous",
	// 	community: false,
	// 	aliases: "searchgpt",
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: true,
	//
		// },
	// community models - use upstream endpoints
	// {
	// 	name: "elixposearch",
	// 	description: "Elixpo Search",
	// 	handler: generateTextPortkey,
	// 	provider: "azure",
	// 	tier: "anonymous",
	// 	community: true,
	// 	input_modalities: ["text"],
	// 	output_modalities: ["text"],
	// 	tools: false,
	// },
	{
		name: "unity",
		description: "Unity Unrestricted Agent",
		handler: unityMistralLarge,		provider: "scaleway",
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
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
		tools: true
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
		tools: true
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
		tools: true
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
		tools: true
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
		tools: true
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
		tools: true
	},

];

// Use the models array directly without sorting
const unsortedModels = models;

// Define default pricing values


// Now export the processed models with proper functional approach
export const availableModels = unsortedModels.map((model) => {
	const inputs = model.input_modalities || [];
	const outputs = model.output_modalities || [];

	return {
		...model,
		vision: inputs.includes("image"),
		audio: inputs.includes("audio") || outputs.includes("audio")
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
			(model) => model.name === modelName || (model.aliases && model.aliases.includes(modelName)),
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
		aliasMap[model.name] = model.aliases || [];
		return aliasMap;
	}, {});
}
