import dotenv from "dotenv";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import debug from "debug";
import googleCloudAuth from "./auth/googleCloudAuth.js";
import {
	extractApiVersion,
	extractDeploymentName,
	extractResourceName,
	generatePortkeyHeaders,
} from "./portkeyUtils.js";
import { findModelByName } from "./availableModels.js";
import { sanitizeMessagesWithPlaceholder } from "./utils/messageSanitizer.js";

dotenv.config();

export const log = debug("pollinations:portkey");
const errorLog = debug("pollinations:portkey:error");

// Model mapping is now handled via mappedModel field in availableModels.js

// Default options
const DEFAULT_OPTIONS = {
	model: "openai-fast",
	jsonMode: false,
};

/**
 * Generates text using a local Portkey gateway with OpenAI-compatible endpoints
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */

// Base configurations for different providers (without x-portkey- prefix)
const baseAzureConfig = {
	provider: "azure-openai",
	retry: "3",
};

/**
 * Creates an Azure model configuration
 * @param {string} apiKey - Azure API key
 * @param {string} endpoint - Azure endpoint
 * @param {string} modelName - Model name to use if not extracted from endpoint
 * @returns {Object} - Azure model configuration
 */
function createAzureModelConfig(
	apiKey,
	endpoint,
	modelName,
	resourceName = null,
) {
	const deploymentId = extractDeploymentName(endpoint) || modelName;
	return {
		...baseAzureConfig,
		"azure-api-key": apiKey,
		"azure-resource-name": resourceName || extractResourceName(endpoint),
		"azure-deployment-id": deploymentId,
		"azure-api-version": extractApiVersion(endpoint),
		"azure-model-name": deploymentId,
		authKey: apiKey, // For Authorization header
	};
}

// Base configuration for Cloudflare models
const baseCloudflareConfig = {
	provider: "openai",
	"custom-host": `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
	authKey: process.env.CLOUDFLARE_AUTH_TOKEN,
	// Set default max_tokens to 8192 (increased from 256)
	"max-tokens": 8192,
};

// Base configuration for Scaleway models
const baseScalewayConfig = {
	provider: "openai",
	"custom-host": `${process.env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1"}`,
	authKey: process.env.SCALEWAY_API_KEY,
	// Set default max_tokens to 8192 (increased from default)
	"max-tokens": 8192,
};

// Base configuration for Mistral Scaleway model

// Base configuration for Mistral Scaleway model
const baseMistralConfig = {
	provider: "openai",
	"custom-host": process.env.SCALEWAY_MISTRAL_BASE_URL,
	authKey: process.env.SCALEWAY_MISTRAL_API_KEY,
	// Set default max_tokens to 8192
	"max-tokens": 8192,
	// Default temperature for Mistral models (low/focused)
	temperature: 0.3,
};

// Base configuration for Modal models
const baseModalConfig = {
	provider: "openai",
	"custom-host": "https://pollinations--hormoz-serve.modal.run/v1",
	authKey: process.env.HORMOZ_MODAL_KEY,
	// Set default max_tokens to 4096
	"max-tokens": 4096,
};

// Base configuration for OpenRouter models
const baseOpenRouterConfig = {
	provider: "openai",
	"custom-host": "https://openrouter.ai/api/v1",
	authKey: process.env.OPENROUTER_API_KEY,
	// Set default max_tokens to 4096
	"max-tokens": 4096,
};

// Navy API configuration for o4-mini model
const baseMonoAIConfig = {
	provider: "openai",
	authKey: process.env.APINAVY_API_KEY,
	"custom-host": process.env.API_NAVY_ENDPOINT,
};

// DeepSeek model configuration
const baseDeepSeekConfig = {
	provider: "openai",
	"custom-host": process.env.AZURE_DEEPSEEK_V3_ENDPOINT,
	authKey: process.env.AZURE_DEEPSEEK_V3_API_KEY,
	"auth-header-name": "Authorization",
	"auth-header-value-prefix": "",
	"max-tokens": 8192,
};

const baseDeepSeekReasoningConfig = {
	provider: "openai",
	"custom-host": process.env.AZURE_DEEPSEEK_REASONING_ENDPOINT,
	authKey: process.env.AZURE_DEEPSEEK_REASONING_API_KEY,
	"auth-header-name": "Authorization",
	"auth-header-value-prefix": "",
	"max-tokens": 8192,
};

// Base configuration for Nebius models
const baseNebiusConfig = {
	provider: "openai",
	"custom-host": "https://api.studio.nebius.com/v1",
	authKey: process.env.NEBIUS_API_KEY,
	"max-tokens": 8192,
	// temperature: 0.7,
};

// ElixpoSearch custom endpoint configuration
const baseElixpoSearchConfig = {
	provider: "openai",
	"custom-host": process.env.ELIXPOSEARCH_ENDPOINT,
	"max-tokens": 4096,
};

// Base configuration for Intelligence.io models
const baseIntelligenceConfig = {
	provider: "openai",
	"custom-host": "https://api.intelligence.io.solutions/api/v1",
	authKey: process.env.IOINTELLIGENCE_API_KEY,
	"max-tokens": 8192,
	temperature: 0.7,
};

/**
 * Creates a DeepSeek model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - DeepSeek model configuration
 */
function createDeepSeekModelConfig(additionalConfig = {}) {
	return {
		...baseDeepSeekConfig,
		...additionalConfig,
	};
}

/**
 * Creates a DeepSeek Reasoning model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - DeepSeek Reasoning model configuration
 */
function createDeepSeekReasoningConfig(additionalConfig = {}) {
	return {
		...baseDeepSeekReasoningConfig,
		...additionalConfig,
	};
}

/**
 * Creates a Cloudflare model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Cloudflare model configuration
 */
function createCloudflareModelConfig(additionalConfig = {}) {
	return {
		...baseCloudflareConfig,
		...additionalConfig,
	};
}

/**
 * Creates a Scaleway model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Scaleway model configuration
 */
function createScalewayModelConfig(additionalConfig = {}) {
	return {
		...baseScalewayConfig,
		...additionalConfig,
	};
}

/**
 * Creates a Mistral model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Mistral model configuration
 */
function createMistralModelConfig(additionalConfig = {}) {
	return {
		...baseMistralConfig,
		...additionalConfig,
	};
}

/**
 * Creates a Nebius model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Nebius model configuration
 */
function createNebiusModelConfig(additionalConfig = {}) {
	return {
		...baseNebiusConfig,
		...additionalConfig,
	};
}

/**
 * Creates a Modal model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Modal model configuration
 */
function createModalModelConfig(additionalConfig = {}) {
	return {
		...baseModalConfig,
		...additionalConfig,
	};
}

/**
 * Creates an OpenRouter model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - OpenRouter model configuration
 */
function createOpenRouterModelConfig(additionalConfig = {}) {
	return {
		...baseOpenRouterConfig,
		...additionalConfig,
	};
}

/**
 * Creates an ElixpoSearch model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - ElixpoSearch model configuration
 */
function createElixpoSearchModelConfig(additionalConfig = {}) {
	return {
		...baseElixpoSearchConfig,
		...additionalConfig,
	};
}

/**
 * Creates an Intelligence.io model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - Intelligence.io model configuration
 */
function createIntelligenceModelConfig(additionalConfig = {}) {
	return {
		...baseIntelligenceConfig,
		...additionalConfig,
	};
}

// Base configuration for AWS Bedrock Lambda endpoint
const baseBedrockLambdaConfig = {
	provider: "openai",
	"custom-host": "https://s4gu3klsuhlqkol3x3qq6bv6em0cwqnu.lambda-url.us-east-1.on.aws/api/v1",
	authKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
	// "max-tokens": 4096,
	// temperature: 0.7,
};

/**
 * Creates an AWS Bedrock Lambda model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - AWS Bedrock Lambda model configuration
 */
function createBedrockLambdaModelConfig(additionalConfig = {}) {
	return {
		...baseBedrockLambdaConfig,
		...additionalConfig,
	};
}

// Unified flat Portkey configuration for all providers and models - using functions that return fresh configurations
export const portkeyConfig = {
	// Azure Grok model configuration
	"azure-grok": () =>
		createAzureModelConfig(
			process.env.AZURE_GENERAL_API_KEY,
			process.env.AZURE_GENERAL_ENDPOINT,
			`grok-3-mini`,
			"pollinations-safety",
		),
	// Azure OpenAI model configurations
	"gpt-4.1-nano": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_NANO_API_KEY,
			process.env.AZURE_OPENAI_NANO_ENDPOINT,
			"gpt-4.1-nano",
		),
	"gpt-5-nano": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_NANO_5_API_KEY,
			process.env.AZURE_OPENAI_NANO_5_ENDPOINT,
			"gpt-5-nano",
		),
	"azure-gpt-5": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_GPT_5_API_KEY,
			process.env.AZURE_OPENAI_GPT_5_ENDPOINT,
			"gpt-5",
		),
	"gpt-4.1-nano-roblox": () => {
		// Randomly select one of the 3 roblox endpoints
		const endpoints = [
			{
				apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_1,
				endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_1,
			},
			{
				apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_2,
				endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_2,
			},
			{
				apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_3,
				endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_3,
			},
			{
				apiKey: process.env.AZURE_OPENAI_ROBLOX_API_KEY_4,
				endpoint: process.env.AZURE_OPENAI_ROBLOX_ENDPOINT_4,
			},
		];

		const randomIndex = Math.floor(Math.random() * endpoints.length);
		const selectedEndpoint = endpoints[randomIndex];

		log(
			`Selected random roblox endpoint ${randomIndex + 1}: ${selectedEndpoint.endpoint}`,
		);

		return createAzureModelConfig(
			selectedEndpoint.apiKey,
			selectedEndpoint.endpoint,
			"gpt-4.1-nano",
		);
	},
	"gpt-4o-mini": () => {
		// Randomly select one of the 3 roblox endpoints
		const endpoints = [
			{
				apiKey: process.env.AZURE_OPENAI_MINI_API_KEY_1,
				endpoint: process.env.AZURE_OPENAI_MINI_ENDPOINT_1,
			},
			{
				apiKey: process.env.AZURE_OPENAI_MINI_API_KEY_2,
				endpoint: process.env.AZURE_OPENAI_MINI_ENDPOINT_2,
			},
		];

		const randomIndex = Math.floor(Math.random() * endpoints.length);
		const selectedEndpoint = endpoints[randomIndex];

		log(
			`Selected random roblox endpoint ${randomIndex + 1}: ${selectedEndpoint.endpoint}`,
		);

		return createAzureModelConfig(
			selectedEndpoint.apiKey,
			selectedEndpoint.endpoint,
			"gpt-4o-mini",
		);
	},
	"gpt-4o": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_LARGE_API_KEY,
			process.env.AZURE_OPENAI_LARGE_ENDPOINT,
			"gpt-4o",
		),
	"o1-mini": () =>
		createAzureModelConfig(
			process.env.AZURE_O1MINI_API_KEY,
			process.env.AZURE_O1MINI_ENDPOINT,
			"o1-mini",
		),
	"o4-mini": () =>
		createAzureModelConfig(
			process.env.AZURE_O4MINI_API_KEY,
			process.env.AZURE_O4MINI_ENDPOINT,
			"o4-mini",
		),
	"gpt-4o-mini-audio-preview": () => ({
		...createAzureModelConfig(
			process.env.AZURE_OPENAI_AUDIO_API_KEY,
			process.env.AZURE_OPENAI_AUDIO_ENDPOINT,
			"gpt-4o-mini-audio-preview",
		),
		"max-tokens": 512,
		"max-completion-tokens": 512,
	}),
	"gpt-4o-audio-preview": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_AUDIO_LARGE_API_KEY,
			process.env.AZURE_OPENAI_AUDIO_LARGE_ENDPOINT,
			"gpt-4o-audio-preview",
		),
	"azure-gpt-4.1": () => ({
		...createAzureModelConfig(
			process.env.AZURE_OPENAI_41_API_KEY,
			process.env.AZURE_OPENAI_41_ENDPOINT,
			"gpt-4.1",
		),
		"max-tokens": 1024,
		"max-completion-tokens": 1024,
	}),
	"azure-gpt-4.1-xlarge": () =>
		createAzureModelConfig(
			process.env.AZURE_OPENAI_XLARGE_API_KEY,
			process.env.AZURE_OPENAI_XLARGE_ENDPOINT,
			"gpt-4.1",
		),
	"Cohere-command-r-plus-08-2024-jt": () => ({
		provider: "openai",
		"custom-host": process.env.AZURE_COMMAND_R_ENDPOINT,
		authKey: process.env.AZURE_COMMAND_R_API_KEY,
		"auth-header-name": "Authorization",
		"auth-header-value-prefix": "",
		"max-tokens": 800,
	}),
	// Cloudflare model configurations
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast": () =>
		createCloudflareModelConfig(),
	"@cf/meta/llama-3.1-8b-instruct": () => createCloudflareModelConfig(),
	"@cf/meta/llama-3.1-8b-instruct-fp8": () => createCloudflareModelConfig(),
	"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": () =>
		createCloudflareModelConfig(),
	"@cf/mistralai/mistral-small-3.1-24b-instruct": () =>
		createCloudflareModelConfig({
			"max-tokens": 8192,
			temperature: 0.3,
			model: "@cf/mistralai/mistral-small-3.1-24b-instruct",
		}),
	"@hf/thebloke/llamaguard-7b-awq": () => ({
		...createCloudflareModelConfig(),
		"max-tokens": 4000,
	}),
	"phi-4-instruct": () => ({
		provider: "openai",
		"custom-host": process.env.OPENAI_PHI4_ENDPOINT,
		authKey: process.env.OPENAI_PHI4_API_KEY,
	}),
	"phi-4-mini-instruct": () => ({
		provider: "openai",
		"custom-host": process.env.OPENAI_PHI4_MINI_ENDPOINT,
		authKey: process.env.OPENAI_PHI4_MINI_API_KEY,
	}),
	"@cf/meta/llama-3.2-11b-vision-instruct": () => createCloudflareModelConfig(),
	"@cf/meta/llama-4-scout-17b-16e-instruct": () => ({
		...createCloudflareModelConfig(),
		"max-tokens": 4096, // Reduced from 8192 to avoid context length errors
	}),
	// Scaleway model configurations
	"qwen3-235b-a22b-instruct-2507": () => createScalewayModelConfig(),
	"qwen2.5-coder-32b-instruct": () =>
		createScalewayModelConfig({
			"max-tokens": 8000, // Set specific token limit for Qwen Coder
		}),
	"llama-3.3-70b-instruct": () => createScalewayModelConfig(),
	"deepseek-r1-distill-llama-70b": () => createScalewayModelConfig(),
	"qwen-coder": () => createScalewayModelConfig(),
	"evil-mistral": () => createScalewayModelConfig(),
	surscaleway: () => createScalewayModelConfig(),
	"qwen-reasoning": () => createScalewayModelConfig(),
	"openai-reasoning": () => ({ ...baseMonoAIConfig }),
	"o4-mini": () => ({ ...baseMonoAIConfig }),
	searchgpt: () => ({ ...baseMonoAIConfig }),
	"gpt-4o-mini-search-preview": () => ({ ...baseMonoAIConfig }),
	unity: () => createScalewayModelConfig(),
	"mis-unity": () =>
		createScalewayModelConfig({
			retry: "0",
		}),
	"mistral-small-3.1-24b-instruct-2503": () =>
		createScalewayModelConfig({
			"max-tokens": 8192,
			model: "mistral-small-3.1-24b-instruct-2503",
		}),
	// Nebius model configurations
	"mistralai/Mistral-Nemo-Instruct-2407": () => createNebiusModelConfig({model: 'mistralai/Mistral-Nemo-Instruct-2407'}),
	"meta-llama/Meta-Llama-3.1-8B-Instruct-fast": () =>
		createNebiusModelConfig({
			model: "meta-llama/Meta-Llama-3.1-8B-Instruct-fast",
		}),
	"deepseek-ai/DeepSeek-R1-0528": () =>
		createNebiusModelConfig({
			model: "deepseek-ai/DeepSeek-R1-0528",
			"max-tokens": 2000,
		}),
	"google/gemma-2-9b-it-fast": () =>
		createNebiusModelConfig({
			model: "google/gemma-2-9b-it-fast",
			'max-tokens': 1024,
		}),
	// Intelligence.io model configurations
	"THUDM/glm-4-9b-chat": () =>
		createIntelligenceModelConfig({
			model: "THUDM/glm-4-9b-chat",
		}),
	// Modal model configurations
	"Hormoz-8B": () => createModalModelConfig(),
	// OpenRouter model configurations
	"anthropic/claude-3.5-haiku-20241022": () =>
		createOpenRouterModelConfig({
			"http-referer": "https://pollinations.ai",
			"x-title": "Pollinations.AI",
		}),
	// Cloudflare models
	"@cf/qwen/qwq-32b": () =>
		createCloudflareModelConfig({
			"http-referer": "https://pollinations.ai",
			"x-title": "Pollinations.AI",
		}),
	// Google Vertex AI model configurations
	"gemini-2.5-flash-preview-04-17": () => ({
		provider: "vertex-ai",
		authKey: googleCloudAuth.getAccessToken, // Fix: use getAccessToken instead of getToken
		"vertex-project-id": process.env.GCLOUD_PROJECT_ID,
		"vertex-region": "us-central1",
		"vertex-model-id": "gemini-2.5-flash-preview-04-17",
		"strict-openai-compliance": "false",
	}),
	"gemini-2.5-pro-exp-03-25": () => ({
		provider: "vertex-ai",
		authKey: googleCloudAuth.getAccessToken,
		"vertex-project-id": process.env.GCLOUD_PROJECT_ID,
		"vertex-region": "us-central1",
		"vertex-model-id": "gemini-2.5-pro-exp-03-25",
		"strict-openai-compliance": "false",
	}),
	"gemini-2.0-flash-thinking": () => ({
		provider: "vertex-ai",
		authKey: googleCloudAuth.getAccessToken,
		"vertex-project-id": process.env.GCLOUD_PROJECT_ID,
		"vertex-region": "us-central1",
		"vertex-model-id": "gemini-2.0-flash-thinking",
		"strict-openai-compliance": "false",
	}),
	// "gemini-2.5-flash-lite": () => ({
	// 	provider: "vertex-ai",
	// 	authKey: googleCloudAuth.getAccessToken,
	// 	"vertex-project-id": process.env.GCLOUD_PROJECT_ID,
	// 	"vertex-region": "us-central1",
	// 	"vertex-model-id": "gemini-2.5-flash-lite",
	// 	"strict-openai-compliance": "false",
	// }),
	"gemini-2.5-flash-lite": () => baseMonoAIConfig,
	"gemini-2.5-flash-lite-search": () => ({
		provider: "vertex-ai",
		"vertex-project-id": process.env.GCLOUD_PROJECT_ID,
		"vertex-region": "us-central1",
		"vertex-model-id": "gemini-2.5-flash-lite",
		"strict-openai-compliance": "false",
	}),
	"deepseek-ai/deepseek-r1-0528-maas": () => ({
		provider: "openai",
		authKey: googleCloudAuth.getAccessToken,
		"custom-host": `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT_ID}/locations/us-central1/endpoints/openapi`,
		"strict-openai-compliance": "false",
	}),
	"DeepSeek-V3-0324": () => createDeepSeekModelConfig(),
	"MAI-DS-R1": () => createDeepSeekReasoningConfig(),
	// Custom endpoints
	"elixposearch-endpoint": () => createElixpoSearchModelConfig(),
	// AWS Bedrock Lambda endpoint
	"eu.anthropic.claude-sonnet-4-20250514-v1:0": () => createBedrockLambdaModelConfig({
		model: "eu.anthropic.claude-sonnet-4-20250514-v1:0",
	}),
	"amazon.nova-micro-v1:0": () => createBedrockLambdaModelConfig({
		model: "awsbedrock/amazon.nova-micro-v1:0",
	}),
	"us.anthropic.claude-3-5-haiku-20241022-v1:0": () => createBedrockLambdaModelConfig({
		model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
	}),
	"mistral.mistral-small-2402-v1:0": () => createBedrockLambdaModelConfig({
		model: "mistral.mistral-small-2402-v1:0",
	}),
	"meta.llama3-1-8b-instruct-v1:0": () => createBedrockLambdaModelConfig({
		model: "meta.llama3-1-8b-instruct-v1:0",
	}),
	"us.meta.llama3-2-1b-instruct-v1:0": () => createBedrockLambdaModelConfig({
		model: "us.meta.llama3-2-1b-instruct-v1:0",
	}),
	"us.meta.llama3-2-3b-instruct-v1:0": () => createBedrockLambdaModelConfig({
		model: "us.meta.llama3-2-3b-instruct-v1:0",
	}),
	"us.meta.llama3-1-8b-instruct-v1:0": () => createBedrockLambdaModelConfig({
		model: "us.meta.llama3-1-8b-instruct-v1:0",
	}),
	// Navy API endpoint
	"o4-mini": () => ({
		...baseMonoAIConfig,
		model: "o4-mini",
		"max-tokens": 8192,
	}),
	"us.deepseek.r1-v1:0": () => createBedrockLambdaModelConfig({
		model: "us.deepseek.r1-v1:0",
		"max-tokens": 2000,
	}),
	"mistral.mistral-small-2402-v1:0": () => createBedrockLambdaModelConfig({
		model: "mistral.mistral-small-2402-v1:0",
	}),
};

/**
 * Configuration object for the Portkey client
 */
const clientConfig = {
	// Use Portkey API Gateway URL from .env with fallback to localhost
	endpoint: () =>
		`${process.env.PORTKEY_GATEWAY_URL || "http://localhost:8787"}/v1/chat/completions`,

	// Auth header configuration
	authHeaderName: "Authorization",
	authHeaderValue: () => {
		// Use the actual Portkey API key from environment variables
		return `Bearer ${process.env.PORTKEY_API_KEY}`;
	},

	// Additional headers will be dynamically set in transformRequest
	additionalHeaders: {},

	// Models that don't support system messages will have system messages converted to user messages
	// This decision is made based on the model being requested
	supportsSystemMessages: (options) => {
		// Check if it's a model that doesn't support system messages
		return !["openai-reasoning", "o4-mini", "deepseek-reasoning"].includes(
			options.model,
		);
	},

	// formatResponse: (message) => {
	//     // fix deepseek-v3 response
	//     if (!message.content && message.reasoning_content) {
	//         message.content = message.reasoning_content;
	//         message.reasoning_content = null;
	//     }
	//     if (message.content && message.reasoning_content) {
	//         message.content = `<think>${message.reasoning_content}</think>${message.content}`;
	//         message.reasoning_content = null;
	//     }
	//     return message;
	// },

	// Default options (model mapping now handled in transformRequest, system prompts now handled via transforms)
	defaultOptions: DEFAULT_OPTIONS,
};

/**
 * Generates text using a local Portkey gateway with Azure OpenAI models
 */
export async function generateTextPortkey(messages, options = {}) {
	// Create a copy of options to avoid mutating the original
	const processedOptions = { ...options };
	
	// Apply model transform if it exists
	let processedMessages = messages;
	if (processedOptions.model) {
		const modelDef = findModelByName(processedOptions.model);
		if (modelDef?.transform) {
			const transformed = modelDef.transform(messages, processedOptions);
			processedMessages = transformed.messages;
			Object.assign(processedOptions, transformed.options);
		}
	}
	
	// Apply transformRequest logic inline (moved from clientConfig)
	if (processedOptions.model) {
		try {
			// Map the virtual model name to the real model name for API calls
			const virtualModelName = processedOptions.model;
			const modelDef = findModelByName(virtualModelName);
			const modelName = modelDef?.mappedModel || virtualModelName;
			
			// Update the options with the mapped model name
			processedOptions.model = modelName;

			// Get the model configuration object
			const configFn = portkeyConfig[modelName];

			if (!configFn) {
				errorLog(`No configuration found for model: ${modelName}`);
				throw new Error(
					`No configuration found for model: ${modelName}. Available configs: ${Object.keys(portkeyConfig).join(", ")}`,
				);
			}
			const config = configFn(); // Call the function to get the actual config

			log(
				"Processing request for model:",
				modelName,
				"with provider:",
				config.provider,
			);

			// Generate headers (now async call)
			const additionalHeaders = await generatePortkeyHeaders(config);
			log(
				"Added provider-specific headers:",
				JSON.stringify(additionalHeaders, null, 2),
			);

			// Set the headers as a property on the options object that will be used by genericOpenAIClient
			processedOptions._additionalHeaders = additionalHeaders;

			// Determine model configuration early (used by sanitizer and limits)
			const modelConfig = findModelByName(virtualModelName);
			log("Model config:", modelConfig);

			// Sanitize messages and apply provider-specific fixes
			if (Array.isArray(processedMessages)) {
				const { messages: sanitized, replacedCount } = sanitizeMessagesWithPlaceholder(
					processedMessages,
					modelConfig,
					virtualModelName,
				);
				processedMessages = sanitized;
				if (replacedCount > 0) {
					log(`Replaced ${replacedCount} empty user message content with placeholder`);
				}
			}

			// Check if the model has a specific maxInputChars limit in availableModels.js
			// Check model-specific character limit (only if model defines maxInputChars)
			if (modelConfig && modelConfig.maxInputChars) {
				const totalChars = countMessageCharacters(processedMessages);
				if (totalChars > modelConfig.maxInputChars) {
					errorLog(
						"Input text exceeds model-specific limit of %d characters for model %s (current: %d)",
						modelConfig.maxInputChars,
						processedOptions.model,
						totalChars,
					);
					throw new Error(
						`Input text exceeds maximum length of ${modelConfig.maxInputChars} characters for model ${processedOptions.model} (current: ${totalChars})`,
					);
				}
			}

			// For models with specific token limits or those using defaults
			if (!processedOptions.max_tokens) {
				if (modelConfig && modelConfig.maxTokens) {
					// Use model-specific maxTokens if defined
					log(
						`Setting max_tokens to model-specific value: ${modelConfig.maxTokens}`,
					);
					processedOptions.max_tokens = modelConfig.maxTokens;
				} else if (config["max-tokens"]) {
					// Fall back to provider default
					log(`Setting max_tokens to default value: ${config["max-tokens"]}`);
					processedOptions.max_tokens = config["max-tokens"];
				}
			}

			// Apply model-specific sampling parameter defaults if not provided by user
			// Only set defaults if user hasn't provided values (they take precedence)
			const samplingParams = [
				"temperature",
				"top_p",
				"presence_penalty",
				"frequency_penalty",
			];
			samplingParams.forEach((param) => {
				if (processedOptions[param] === undefined && config[param] !== undefined) {
					log(`Setting ${param} to model default value: ${config[param]}`);
					processedOptions[param] = config[param];
				}
			});

			// Fix for grok model: always set seed to null
			if (modelName === "azure-grok" && processedOptions.seed !== undefined) {
				log(`Setting seed to null for grok model (was: ${processedOptions.seed})`);
				processedOptions.seed = null;
			}

			// Handle roblox-rp random model selection
			if (modelName === "roblox-rp") {
				// Get the actual selected model from the config
				const actualModel = config.model;
				log(`Overriding roblox-rp model name to actual selected model: ${actualModel}`);
				processedOptions.model = actualModel;
			}

			// Add Google Search grounding for Gemini Search model
			if (modelName === "gemini-2.5-flash-lite-search") {
				log(`Adding Google Search grounding tool for ${modelName}`);
				// Override model name to use the actual Vertex AI model name
				processedOptions.model = "gemini-2.5-flash-lite";
				// Add google_search tool for grounding with Google Search
				// This enables real-time search results grounding for Gemini responses
				// Add the google_search tool (for newer models like gemini-2.0-flash-001)
				processedOptions.tools = [{
					type: "function",
					function: {
						name: "google_search"
					}
				}];
			}

			// Apply model-specific parameter filtering
			// Some models like searchgpt only accept specific parameters
			const modelParameterAllowList = {
				"gpt-4o-mini-search-preview": ["messages", "stream", "model"], // Only these parameters are allowed for searchgpt
				// Add more models as needed
			};

			// Check if the current model has parameter restrictions
			const allowedParams = modelParameterAllowList[processedOptions.model];
			if (allowedParams) {
				log(
					`Applying parameter filter for model ${processedOptions.model}, allowing only: ${allowedParams.join(", ")}`,
				);

				// Create a new options object with only allowed parameters
				const filteredOptions = {};

				// Only include parameters that are in the allow list
				for (const param of allowedParams) {
					if (processedOptions[param] !== undefined) {
						filteredOptions[param] = processedOptions[param];
					}
				}

				// Preserve the additional headers
				if (processedOptions._additionalHeaders) {
					filteredOptions._additionalHeaders = processedOptions._additionalHeaders;
				}

				// Use filtered options
				Object.assign(processedOptions, filteredOptions);
			}

		} catch (error) {
			errorLog("Error in request transformation:", error);
			throw error;
		}
	}
	
	// Move additional headers from processedOptions to config for genericOpenAIClient
	if (processedOptions._additionalHeaders) {
		clientConfig.additionalHeaders = {
			...clientConfig.additionalHeaders,
			...processedOptions._additionalHeaders
		};
		// Remove from options since it's now in config
		delete processedOptions._additionalHeaders;
	}
	
	return await genericOpenAIClient(processedMessages, processedOptions, clientConfig);
}

function countMessageCharacters(messages) {
	return messages.reduce((total, message) => {
		if (typeof message.content === "string") {
			return total + message.content.length;
		}
		if (Array.isArray(message.content)) {
			return (
				total +
				message.content.reduce((sum, part) => {
					if (part.type === "text") {
						return sum + part.text.length;
					}
					return sum;
				}, 0)
			);
		}
		return total;
	}, 0);
}
