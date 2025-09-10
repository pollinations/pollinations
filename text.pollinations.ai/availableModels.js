// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import { createSystemPromptTransform, removeSystemMessages } from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";

// Import persona prompts
import unityPrompt from "./personas/unity.js";
import midijourneyPrompt from "./personas/midijourney.js";
import rtistPrompt from "./personas/rtist.js";
import evilPrompt from "./personas/evil.js";
import mirexaSystemPrompt from "./personas/mirexa.js";
import { bidaraSystemPrompt } from "./personas/bidara.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig } from "./configs/modelConfigs.js";

const models = [
	{
		name: "openai",
		description: "OpenAI GPT-5 Nano",
		config: portkeyConfig["gpt-5-nano"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		aliases: ["gpt-5-nano", "openai-large"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "openai-fast",
		description: "OpenAI GPT-4.1 Nano",
		config: portkeyConfig["gpt-4.1-nano"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	// {
	// 	name: "openai-large",
	// 	description: "OpenAI GPT-4.1",
	// 	maxInputChars: 5000,
	// 	config: portkeyConfig["azure-gpt-4.1"],
	// 	transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
	// 	tier: "seed",
	// 	community: false,
	// 	aliases: ["gpt-4.1"],
	// 	input_modalities: ["text", "image"],
	// 	output_modalities: ["text"],
	// 	tools: true
	// },
	{
		name: "qwen-coder",
		description: "Qwen 2.5 Coder 32B",
		config: portkeyConfig["qwen2.5-coder-32b-instruct"],
		transform: createSystemPromptTransform(BASE_PROMPTS.coding),
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
		config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		aliases: ["mistral-small-3.1-24b-instruct", "mistral-small-3.1-24b-instruct-2503"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "mistral-romance",
		description: "Mistral Small 2402 (Bedrock) - Romance Companion",
		config: portkeyConfig["mistral.mistral-small-2402-v1:0"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
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
		config: portkeyConfig["us.deepseek.r1-v1:0"],
		transform: pipe(
			createSystemPromptTransform(BASE_PROMPTS.conversational),
			removeSystemMessages
		),
		reasoning: true,
		tier: "seed",
		community: false,
		aliases: ["deepseek-r1-0528", "us.deepseek.r1-v1:0"],
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
		config: portkeyConfig["gpt-4o-mini-audio-preview"],
		tier: "seed",
		community: false,
		aliases: ["gpt-4o-mini-audio-preview"],
		input_modalities: ["text", "image", "audio"],
		output_modalities: ["audio", "text"],
		tools: true
	},
	{
		name: "nova-fast",
		description: "Amazon Nova Micro (Bedrock)",
		config: portkeyConfig["amazon.nova-micro-v1:0"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
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
		config: portkeyConfig["us.meta.llama3-1-8b-instruct-v1:0"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
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
		config: portkeyConfig["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
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
		config: portkeyConfig["o4-mini"],
		transform: pipe(
			createSystemPromptTransform(BASE_PROMPTS.conversational),
			removeSystemMessages
		),
		tier: "seed",
		community: false,
		aliases: ["o4-mini"],
		reasoning: true,
		supportsSystemMessages: false,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "gemini",
		description: "Gemini 2.5 Flash Lite (api.navy)",
		config: portkeyConfig["gemini-2.5-flash-lite"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		aliases: ["gemini-2.5-flash-lite"],
		input_modalities: ["text", "image"],
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
		config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
		transform: createMessageTransform(unityPrompt),
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
		config: portkeyConfig["azure-gpt-4.1"],
		transform: createMessageTransform(mirexaSystemPrompt),
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "midijourney",
		description: "MIDIjourney",
		config: portkeyConfig["azure-gpt-4.1"],
		transform: createMessageTransform(midijourneyPrompt),
		tier: "anonymous",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "rtist",
		description: "Rtist",
		config: portkeyConfig["azure-gpt-4.1"],
		transform: createMessageTransform(rtistPrompt),
		tier: "seed",
		community: true,
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "evil",
		description: "Evil",
		config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
		transform: createMessageTransform(evilPrompt),
		uncensored: true,
		tier: "seed",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	// {
	// 	name: "sur",
	// 	description: "Sur AI Assistant",
	// 	handler: surMistral,
	// 	provider: "scaleway",
	// 	tier: "seed",
	// 	community: true,
	// 	input_modalities: ["text", "image"],
	// 	output_modalities: ["text"],
	// 	tools: true
	// },
	{
		name: "bidara",
		description: "BIDARA (Biomimetic Designer and Research Assistant by NASA)",
		config: portkeyConfig["gpt-4.1-nano"],
		transform: createMessageTransform(bidaraSystemPrompt),
		tier: "anonymous",
		community: true,
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},

];


// Now export the processed models with proper functional approach
export const availableModels = models.map((model) => {
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
	return availableModels.find((model) => 
		model.name === modelName || 
		(model.aliases && model.aliases.includes(modelName))
	) || null;
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
