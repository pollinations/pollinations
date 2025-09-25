// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import { createSystemPromptTransform, removeSystemMessages } from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGoogleSearchTransform } from "./transforms/createGoogleSearchTransform.js";

// Import persona prompts
import unityPrompt from "./personas/unity.js";
import midijourneyPrompt from "./personas/midijourney.js";
import rtistPrompt from "./personas/rtist.js";
import evilPrompt from "./personas/evil.js";
import { bidaraSystemPrompt } from "./personas/bidara.js";
import chickyTutorPrompt from "./personas/chickytutor.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig } from "./configs/modelConfigs.js";

const models = [
	{
		name: "openai",
		description: "OpenAI GPT-5 Mini",
		config: portkeyConfig["gpt-5-mini"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		aliases: ["gpt-5-mini"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		maxInputChars: 7000,
	},
	{
		name: "openai-fast",
		description: "OpenAI GPT-5 Nano",
		config: portkeyConfig["gpt-5-nano"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "anonymous",
		community: false,
		aliases: ["gpt-5-nano"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		maxInputChars: 5000,
	},
	{
		name: "openai-large",
		description: "OpenAI GPT-5 Chat",
		maxInputChars: 20000,
		config: portkeyConfig["gpt-5-chat"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "seed",
		community: false,
		aliases: ["gpt-5-chat"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true,
		maxInputChars: 10000,
	},
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
		description: "Mistral Small 2402 - Romance Companion",
		config: portkeyConfig["mistral.mistral-small-2402-v1:0"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "flower",
		aliases: ["mistral-nemo-instruct-2407-romance","mistral-roblox"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "deepseek-reasoning",
		description: "DeepSeek R1 0528",
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
		name: "deepseek",
		description: "DeepSeek V3.1 (Google Vertex AI)",
		config: portkeyConfig["deepseek-ai/deepseek-v3.1-maas"],
		transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
		tier: "seed",
		community: false,
		aliases: ["deepseek-v3", "deepseek-v3.1", "deepseek-ai/deepseek-v3.1-maas"],
		input_modalities: ["text"],
		output_modalities: ["text"],
		tools: true
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
		description: "Amazon Nova Micro",
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
		description: "Llama 3.1 8B Instruct (Cross-Region)",
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
		description: "Claude 3.5 Haiku",
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
		tier: "seed",
		community: false,
		aliases: ["gemini-2.5-flash-lite"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},
	{
		name: "gemini-search",
		description: "Gemini 2.5 Flash with Google Search (Google Vertex AI)",
		config: portkeyConfig["gemini-2.5-flash-vertex"],
		transform: pipe(
			createGoogleSearchTransform()
		),
		tier: "seed",
		community: false,
		aliases: ["searchgpt","geminisearch"],
		input_modalities: ["text", "image"],
		output_modalities: ["text"],
		tools: true
	},

	// ======================================
	// Persona Models (use upstream endpoints)
	// ======================================

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
	{
		name: "chickytutor",
		description: "ChickyTutor AI Language Tutor - (chickytutor.com)",
		config: portkeyConfig["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
		transform: createMessageTransform(chickyTutorPrompt),
		tier: "anonymous",
		community: true,
		input_modalities: ["text"],
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
