/**
 * Model cost data and resolution functions
 * 
 * This module contains all cost information for text generation models,
 * indexed by the original model name returned by the LLM providers.
 */

import debug from 'debug';
const log = debug('text.pollinations.ai:modelCost');


/**
 * Cost data indexed by original model names
 * Prices are per million tokens unless otherwise specified
 */
const MODEL_COST = {
	// ===== Azure OpenAI ===== Pricing: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
	"gpt-4.1-nano-2025-04-14": {
	  provider: "azure-openai",
	  region: "eastus",
	  prompt_text: 0.10,
	  prompt_cache: 0.03,
	  completion_text: 0.40
	},
	"gpt-5-nano-2025-08-07": {
	  provider: "azure-openai",
	  region: "eastus2",
	  prompt_text: 0.05,
	  prompt_cache: 0.01,
	  completion_text: 0.35
	},
	"gpt-5-mini-2025-08-07": {
	  provider: "azure-openai",
	  region: "eastus",
	  prompt_text: 0.22,
	  prompt_cache: 0.03,
	  completion_text: 1.73
	},
	"gpt-4.1-2025-04-14": {
	  provider: "azure-openai",
	  region: "eastus",
	  prompt_text: 2.0,
	  prompt_cache: 0.50,
	  completion_text: 8.0
	},
	"gpt-4o-mini-audio-preview-2024-12-17": {
	  provider: "azure-openai",
	  region: "eastus",
	  prompt_text: 0.15,
	  completion_text: 0.60,
	  prompt_audio: 10.0,
	  completion_audio: 20.0
	},
	"gpt-5-chat": {
	  provider: "azure-openai",
	  region: "eastus2",
	  prompt_text: 2.5,
	  prompt_cache: 0.625,
	  completion_text: 10.0
	},

	// ===== Navy API (Gemini) ===== Pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
	"gemini-2.5-flash-lite": {
	  provider: "api.navy",
	  region: "us-central",
	  prompt_text: 0.0,
	  prompt_audio: 0.0,
	  completion_text: 0.0
	},
	"o4-mini-2025-04-16": {
		provider: "api.navy",
		region: "us-central",
		prompt_text: 0.0,
		prompt_cache: 0.0,
		completion_text: 0.0
	  },
	// ===== Google Vertex AI ===== Pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
	"deepseek-ai/deepseek-v3.1-maas": {
		provider: "vertex-ai",
		region: "us-west2",
		prompt_text: 0.60,
		completion_text: 1.70
	},
	"gemini-2.5-flash-vertex": {
		provider: "vertex-ai",
		region: "us-central1",
		prompt_text: 0.075,
		prompt_cache: 0.01875,
		completion_text: 0.30
	  },
	// ===== Scaleway ===== Pricing: https://www.scaleway.com/en/pricing/model-as-a-service/
	"qwen2.5-coder-32b-instruct": {
		provider: "scaleway-ai",
		region: "fr-par-1",
		prompt_text: 1.05,
		completion_text: 1.05
	},
	"mistral-small-3.1-24b-instruct-2503": {
		provider: "scaleway-ai",
		region: "fr-par-1",
		prompt_text: 0.18,
		completion_text: 0.41
	},
  
	// ===== AWS Bedrock ===== Pricing: https://aws.amazon.com/bedrock/pricing/
	"mistral.mistral-small-2402-v1:0": {
	  provider: "aws-bedrock",
	  region: "us-east-1",
	  prompt_text: 1.00,
	  completion_text: 3.00
	},
	"us.deepseek.r1-v1:0": {
	  provider: "aws-bedrock",
	  region: "us-east-1",
	  prompt_text: 1.35,
	  completion_text: 5.40
	},
	"amazon.nova-micro-v1:0": {
	  provider: "aws-bedrock",
	  region: "us-east-1",
	  prompt_text: 0.035,
	  prompt_cache: 0.00875,
	  completion_text: 0.14
	},
	"us.anthropic.claude-3-5-haiku-20241022-v1:0": {
		provider: "aws-bedrock",
		region: "us-east-1",
		prompt_text: 0.80,
		prompt_cache: 0.08,
		prompt_cache_write: 1.0,
		completion_text: 4.0
	},
	"us.meta.llama3-1-8b-instruct-v1:0": {
	  provider: "aws-bedrock",
	  region: "us-east-1",
	  prompt_text: 0.22,
	  completion_text: 0.22
	}
  };

/**
 * Resolve cost for a model by its original name
 * 
 * @param {string} originalName - The original model name returned by the LLM provider
 * @returns {Object} - Cost object with defaults applied
 * @throws {Error} - Throws error if no cost data is found
 */
export function resolveCost(originalName) {
	if (!originalName) {
		throw new Error('Missing cost data. Please contact support@pollinations.ai');
	}

	// Try to find cost data for the model
	if (MODEL_COST[originalName]) {
		const cost = getCost(originalName);
		log(`Resolved cost for ${originalName}`);
		return cost;
	}

	throw new Error(`Missing cost data for model "${originalName}". Please contact support@pollinations.ai`);
}

/**
 * Get cost data for a model
 * 
 * @param {string} originalName - The original model name
 * @returns {Object|null} - Cost object or null if not found
 */
export function getCost(originalName) {
	return MODEL_COST[originalName] || null;
}

/**
 * Check if cost exists for a model
 * 
 * @param {string} originalName - The original model name
 * @returns {boolean} - True if cost exists
 */
export function hasCost(originalName) {
	return !!MODEL_COST[originalName];
}

/**
 * Get provider for a model by its original name
 * 
 * @param {string} originalName - The original model name
 * @returns {string|null} - Provider name or null if not found
 */
export function getProvider(originalName) {
	const costData = MODEL_COST[originalName];
	return costData?.provider || null;
}

/**
 * Get all cost data (for admin/debugging purposes)
 * 
 * @returns {Object} - All cost data
 */
export function getAllCost() {
	return { ...MODEL_COST };
}


