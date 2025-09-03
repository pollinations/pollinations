/**
 * Model pricing data and resolution functions
 * 
 * This module contains all pricing information for text generation models,
 * indexed by the original model name returned by the LLM providers.
 */

import { createLogger } from './utils/logger.js';
const log = createLogger('modelPricing');

/**
 * Default pricing values applied when specific pricing fields are missing
 */
const DEFAULT_PRICING = {
	prompt_text: 1.0,
	completion_text: 4.0,
	prompt_cache: 0.25,
	prompt_audio: 0.0,
	completion_audio: 0.0
};

/**
 * Pricing data indexed by original model names
 * Prices are per million tokens unless otherwise specified
 */
const MODEL_PRICING = {
	// OpenAI Models
	"gpt-5-nano-2025-08-07": {
		prompt_text: 0.055,
		prompt_cache: 0.0055,
		completion_text: 0.44
	},
	"gpt-4.1-2025-04-14": {
		prompt_text: 1.91,
		prompt_cache: 0.48,
		completion_text: 7.64
	},
	"gpt-4.1-nano-2025-04-14": {
		prompt_text: 0.055,
		prompt_cache: 0.0055,
		completion_text: 0.44
	},
	"gpt-4o-mini-audio-preview-2024-12-17": {
		prompt_text: 0.15,
		prompt_cache: 0.075,
		completion_text: 0.6,
		prompt_audio: 0.0,
		completion_audio: 0.0
	},

	// Qwen Models
	"qwen2.5-coder-32b-instruct": {
		prompt_text: 0.4,
		prompt_cache: 0.1,
		completion_text: 1.6
	},

	// Mistral Models
	"mistral-small-3.1-24b-instruct-2503": {
		prompt_text: 0.2,
		prompt_cache: 0.05,
		completion_text: 0.8
	},
	"mistral.mistral-small-2402-v1:0": {
		prompt_text: 0.2,
		prompt_cache: 0.05,
		completion_text: 0.8
	},

	// DeepSeek Models
	"us.deepseek.r1-v1:0": {
		prompt_text: 0.14,
		prompt_cache: 0.035,
		completion_text: 0.28
	},

	// Amazon Nova Models
	"amazon.nova-micro-v1:0": {
		prompt_text: 0.035,
		prompt_cache: 0.009,
		completion_text: 0.14
	},

	// Meta Llama Models
	"us.meta.llama3-1-8b-instruct-v1:0": {
		prompt_text: 0.4,
		prompt_cache: 0.1,
		completion_text: 1.6
	},

	// Anthropic Claude Models
	"us.anthropic.claude-3-5-haiku-20241022-v1:0": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 5.0
	},

	// API.navy Models
	"openai/o4-mini": {
		prompt_text: 0.4,
		prompt_cache: 0.1,
		completion_text: 1.6
	},
	"google/gemini-2.5-flash-lite": {
		prompt_text: 0.4,
		prompt_cache: 0.1,
		completion_text: 1.6
	}
};

/**
 * Resolve pricing for a model by its original name
 * 
 * @param {string} originalName - The original model name returned by the LLM provider
 * @param {string|null} fallbackName - Optional fallback name to try if originalName fails
 * @returns {Object|null} - Pricing object with defaults applied, or null if not found
 */
export function resolvePricing(originalName, fallbackName = null) {
	if (!originalName && !fallbackName) {
		log('No model name provided for pricing resolution');
		return null;
	}

	// Try original name first
	if (originalName && MODEL_PRICING[originalName]) {
		const pricing = getPricingWithDefaults(originalName);
		log(`Resolved pricing for ${originalName}`);
		return pricing;
	}

	// Try fallback name if provided
	if (fallbackName && MODEL_PRICING[fallbackName]) {
		const pricing = getPricingWithDefaults(fallbackName);
		log(`Resolved pricing for ${fallbackName} (fallback from ${originalName})`);
		return pricing;
	}

	log(`No pricing found for ${originalName}${fallbackName ? ` or ${fallbackName}` : ''}`);
	return null;
}

/**
 * Get pricing with default values applied for missing fields
 * 
 * @param {string} originalName - The original model name
 * @returns {Object} - Pricing object with defaults applied
 */
export function getPricingWithDefaults(originalName) {
	const pricing = MODEL_PRICING[originalName];
	if (!pricing) {
		return null;
	}

	return {
		...DEFAULT_PRICING,
		...pricing
	};
}

/**
 * Check if pricing exists for a model
 * 
 * @param {string} originalName - The original model name
 * @param {string|null} fallbackName - Optional fallback name
 * @returns {boolean} - True if pricing exists
 */
export function hasPricing(originalName, fallbackName = null) {
	return !!(MODEL_PRICING[originalName] || (fallbackName && MODEL_PRICING[fallbackName]));
}

/**
 * Get all pricing data (for admin/debugging purposes)
 * 
 * @returns {Object} - All pricing data
 */
export function getAllPricing() {
	return { ...MODEL_PRICING };
}

/**
 * Get default pricing values
 * 
 * @returns {Object} - Default pricing object
 */
export function getDefaultPricing() {
	return { ...DEFAULT_PRICING };
}
