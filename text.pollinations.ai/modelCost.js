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
	// Azure OpenAI models
	"gpt-4.1-nano-2025-04-14": {
		provider: "azure-openai",
		prompt_text: 0.15,
		prompt_cache: 0.075,
		completion_text: 0.6
	},
	"gpt-5-nano-2025-08-07": {
		provider: "azure-openai",
		prompt_text: 0.25,
		prompt_cache: 0.125,
		completion_text: 1.0
	},
	"gpt-4.1-2025-04-14": {
		provider: "azure-openai",
		prompt_text: 2.5,
		prompt_cache: 1.25,
		completion_text: 10.0
	},
	"gpt-4o-mini-audio-preview-2024-12-17": {
		provider: "azure-openai",
		prompt_text: 0.15,
		prompt_cache: 0.075,
		completion_text: 0.6,
		prompt_audio: 10.0,
		completion_audio: 20.0
	},
	// via API Navy
	"o4-mini-2025-04-16": {
		provider: "api-navy",
		prompt_text: 0.15,
		prompt_cache: 0.075,
		completion_text: 0.6
	},
	"gemini-2.5-flash-lite": {
		provider: "api-navy",
		prompt_text: 0.075,
		prompt_cache: 0.0375,
		completion_text: 0.3
	},
	// Qwen Models (Scaleway)
	"qwen2.5-coder-32b-instruct": {
		prompt_text: 0.4,
		prompt_cache: 0.1,
		completion_text: 1.6,
		provider: "scaleway"
	},
	// Mistral Models (Scaleway)
	"mistral-small-3.1-24b-instruct-2503": {
		prompt_text: 0.2,
		prompt_cache: 0.05,
		completion_text: 0.8,
		provider: "scaleway"
	},
	// Mistral Models (Bedrock)
	"mistral.mistral-small-2402-v1:0": {
		prompt_text: 0.2,
		prompt_cache: 0.05,
		completion_text: 0.8,
		provider: "bedrock"
	},
	// DeepSeek Models (Bedrock)
	"us.deepseek.r1-v1:0": {
		prompt_text: 1.35,
		prompt_cache: 0.675,
		completion_text: 5.4,
		provider: "bedrock"
	},

	// Amazon Nova Models (Bedrock)
	"amazon.nova-micro-v1:0": {
		prompt_text: 0.035,
		prompt_cache: 0.0175,
		completion_text: 0.14,
		provider: "bedrock"
	},
	// Meta Llama Models (Bedrock)
	"us.meta.llama3-1-8b-instruct-v1:0": {
		prompt_text: 0.15,
		prompt_cache: 0.0375,
		completion_text: 0.60,
		provider: "bedrock"
	},
	// Anthropic Claude Models (Bedrock)
	"us.anthropic.claude-3-5-haiku-20241022-v1:0": {
		prompt_text: 0.8,
		prompt_cache: 0.2,
		completion_text: 4.0,
		provider: "bedrock"
	},
};

/**
 * Resolve cost for a model by its original name
 * 
 * @param {string} originalName - The original model name returned by the LLM provider
 * @param {string|null} fallbackName - Optional fallback name to try if originalName fails
 * @returns {Object} - Cost object with defaults applied
 * @throws {Error} - Throws error if no cost data is found
 */
export function resolveCost(originalName, fallbackName = null) {
	if (!originalName && !fallbackName) {
		throw new Error('Missing cost data. Please contact support@pollinations.ai');
	}

	// Try original name first
	if (originalName && MODEL_COST[originalName]) {
		const cost = getCost(originalName);
		log(`Resolved cost for ${originalName}`);
		return cost;
	}

	// Try fallback name if provided
	if (fallbackName && MODEL_COST[fallbackName]) {
		const cost = getCost(fallbackName);
		log(`Resolved cost for ${fallbackName} (fallback from ${originalName})`);
		return cost;
	}

	const modelName = originalName || fallbackName;
	throw new Error(`Missing cost data for model "${modelName}". Please contact support@pollinations.ai`);
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
 * @param {string|null} fallbackName - Optional fallback name
 * @returns {boolean} - True if cost exists
 */
export function hasCost(originalName, fallbackName = null) {
	return !!(MODEL_COST[originalName] || (fallbackName && MODEL_COST[fallbackName]));
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


