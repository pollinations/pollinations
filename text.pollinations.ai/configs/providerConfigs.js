import dotenv from "dotenv";
import googleCloudAuth from "../auth/googleCloudAuth.js";
import {
	extractApiVersion,
	extractDeploymentName,
	extractResourceName,
} from "../portkeyUtils.js";

dotenv.config();

// Base configurations for different providers (without x-portkey- prefix)
export const baseAzureConfig = {
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
export function createAzureModelConfig(
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
export const baseCloudflareConfig = {
	provider: "openai",
	"custom-host": `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
	authKey: process.env.CLOUDFLARE_AUTH_TOKEN,
	// Set default max_tokens to 8192 (increased from 256)
	"max-tokens": 8192,
};

// Base configuration for Scaleway models
export const baseScalewayConfig = {
	provider: "openai",
	"custom-host": `${process.env.SCALEWAY_BASE_URL || "https://api.scaleway.com/ai-apis/v1"}`,
	authKey: process.env.SCALEWAY_API_KEY,
	// Set default max_tokens to 8192 (increased from default)
	"max-tokens": 8192,
};

// Base configuration for Mistral Scaleway model
export const baseMistralConfig = {
	provider: "openai",
	"custom-host": process.env.SCALEWAY_MISTRAL_BASE_URL,
	authKey: process.env.SCALEWAY_MISTRAL_API_KEY,
	// Set default max_tokens to 8192
	"max-tokens": 8192,
	// Default temperature for Mistral models (low/focused)
	temperature: 0.3,
};

// Base configuration for Modal models
export const baseModalConfig = {
	provider: "openai",
	"custom-host": "https://pollinations--hormoz-serve.modal.run/v1",
	authKey: process.env.HORMOZ_MODAL_KEY,
	// Set default max_tokens to 4096
	"max-tokens": 4096,
};

// Base configuration for OpenRouter models
export const baseOpenRouterConfig = {
	provider: "openai",
	"custom-host": "https://openrouter.ai/api/v1",
	authKey: process.env.OPENROUTER_API_KEY,
	// Set default max_tokens to 4096
	"max-tokens": 4096,
};

// Navy API configuration for o4-mini model
export const baseMonoAIConfig = {
	provider: "openai",
	authKey: process.env.APINAVY_API_KEY,
	"custom-host": process.env.API_NAVY_ENDPOINT,
};

// DeepSeek model configuration
export const baseDeepSeekConfig = {
	provider: "openai",
	"custom-host": process.env.AZURE_DEEPSEEK_V3_ENDPOINT,
	authKey: process.env.AZURE_DEEPSEEK_V3_API_KEY,
	"auth-header-name": "Authorization",
	"auth-header-value-prefix": "",
	"max-tokens": 8192,
};

export const baseDeepSeekReasoningConfig = {
	provider: "openai",
	"custom-host": process.env.AZURE_DEEPSEEK_REASONING_ENDPOINT,
	authKey: process.env.AZURE_DEEPSEEK_REASONING_API_KEY,
	"auth-header-name": "Authorization",
	"auth-header-value-prefix": "",
	"max-tokens": 8192,
};

// Base configuration for Nebius models
export const baseNebiusConfig = {
	provider: "openai",
	"custom-host": "https://api.studio.nebius.com/v1",
	authKey: process.env.NEBIUS_API_KEY,
	"max-tokens": 8192,
	// temperature: 0.7,
};

// ElixpoSearch custom endpoint configuration
export const baseElixpoSearchConfig = {
	provider: "openai",
	"custom-host": process.env.ELIXPOSEARCH_ENDPOINT,
	"max-tokens": 4096,
};

// Base configuration for Intelligence.io models
export const baseIntelligenceConfig = {
	provider: "openai",
	"custom-host": "https://api.intelligence.io.solutions/api/v1",
	authKey: process.env.IOINTELLIGENCE_API_KEY,
	"max-tokens": 8192,
	temperature: 0.7,
};

// Base configuration for AWS Bedrock Lambda endpoint
export const baseBedrockLambdaConfig = {
	provider: "openai",
	"custom-host": "https://s4gu3klsuhlqkol3x3qq6bv6em0cwqnu.lambda-url.us-east-1.on.aws/api/v1",
	authKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
	// "max-tokens": 4096,
	// temperature: 0.7,
};

/**
 * Creates a DeepSeek model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - DeepSeek model configuration
 */
export function createDeepSeekModelConfig(additionalConfig = {}) {
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
export function createDeepSeekReasoningConfig(additionalConfig = {}) {
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
export function createCloudflareModelConfig(additionalConfig = {}) {
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
export function createScalewayModelConfig(additionalConfig = {}) {
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
export function createMistralModelConfig(additionalConfig = {}) {
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
export function createNebiusModelConfig(additionalConfig = {}) {
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
export function createModalModelConfig(additionalConfig = {}) {
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
export function createOpenRouterModelConfig(additionalConfig = {}) {
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
export function createElixpoSearchModelConfig(additionalConfig = {}) {
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
export function createIntelligenceModelConfig(additionalConfig = {}) {
	return {
		...baseIntelligenceConfig,
		...additionalConfig,
	};
}

/**
 * Creates an AWS Bedrock Lambda model configuration
 * @param {Object} additionalConfig - Additional configuration to merge with base config
 * @returns {Object} - AWS Bedrock Lambda model configuration
 */
export function createBedrockLambdaModelConfig(additionalConfig = {}) {
	return {
		...baseBedrockLambdaConfig,
		...additionalConfig,
	};
}
