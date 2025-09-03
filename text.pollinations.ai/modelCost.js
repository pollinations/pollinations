/**
 * Model cost data and resolution functions
 * 
 * This module contains all cost information for text generation models,
 * indexed by the original model name returned by the LLM providers.
 */

import { createLogger } from './utils/logger.js';
const log = createLogger('modelCost');

/**
 * Default cost values applied when specific cost fields are missing
 */
const DEFAULT_COST = {
	prompt_text: 1.0,
	completion_text: 4.0,
	prompt_cache: 0.25,
	prompt_audio: 0.0,
	completion_audio: 0.0
};

/**
 * Cost data indexed by original model names
 * Prices are per million tokens unless otherwise specified
 */
const MODEL_COST = {
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
		prompt_text: 0.1432,
		prompt_cache: 0.075,
		completion_text: 0.572793,
		prompt_audio: 9.5466,
		completion_audio: 19.093079
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
		prompt_text: 1.35,
		prompt_cache: 0.3375,
		completion_text: 5.4
	},

	// Amazon Nova Models
	"amazon.nova-micro-v1:0": {
		prompt_text: 0.035,
		prompt_cache: 0.009,
		completion_text: 0.14
	},

	// Meta Llama Models
	"us.meta.llama3-1-8b-instruct-v1:0": {
		prompt_text: 0.15,
		prompt_cache: 0.0375,
		completion_text: 0.60
	},

	// Anthropic Claude Models
	"us.anthropic.claude-3-5-haiku-20241022-v1:0": {
		prompt_text: 0.8,
		prompt_cache: 0.2,
		completion_text: 4.0
	},

	// API.navy Models (Free)
	"openai/o4-mini": {
		prompt_text: 0.0,
		prompt_cache: 0.0,
		completion_text: 0.0
	},
	"google/gemini-2.5-flash-lite": {
		prompt_text: 0.0,
		prompt_cache: 0.0,
		completion_text: 0.0
	},
	
	// Commented-out models (for reference)
	"gemini-2.5-flash-lite-search": {
		prompt_text: 0.5,
		prompt_cache: 0.125,
		completion_text: 2.0
	},

	// Community models (using model names as keys)
	"unity": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	},
	"mirexa": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	},
	"midijourney": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	},
	"rtist": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	},
	"evil": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	},
	"bidara": {
		prompt_text: 1.0,
		prompt_cache: 0.25,
		completion_text: 4.0
	}
};

/**
 * Resolve cost for a model by its original name
 * 
 * @param {string} originalName - The original model name returned by the LLM provider
 * @param {string|null} fallbackName - Optional fallback name to try if originalName fails
 * @returns {Object|null} - Cost object with defaults applied, or null if not found
 */
export function resolveCost(originalName, fallbackName = null) {
	if (!originalName && !fallbackName) {
		log('No model name provided for cost resolution');
		return null;
	}

	// Try original name first
	if (originalName && MODEL_COST[originalName]) {
		const cost = getCostWithDefaults(originalName);
		log(`Resolved cost for ${originalName}`);
		return cost;
	}

	// Try fallback name if provided
	if (fallbackName && MODEL_COST[fallbackName]) {
		const cost = getCostWithDefaults(fallbackName);
		log(`Resolved cost for ${fallbackName} (fallback from ${originalName})`);
		return cost;
	}

	log(`No cost found for ${originalName}${fallbackName ? ` or ${fallbackName}` : ''}`);
	return null;
}

/**
 * Get cost with default values applied for missing fields
 * 
 * @param {string} originalName - The original model name
 * @returns {Object} - Cost object with defaults applied
 */
export function getCostWithDefaults(originalName) {
	const cost = MODEL_COST[originalName];
	if (!cost) {
		return null;
	}

	return {
		...DEFAULT_COST,
		...cost
	};
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
 * Get all cost data (for admin/debugging purposes)
 * 
 * @returns {Object} - All cost data
 */
export function getAllCost() {
	return { ...MODEL_COST };
}

/**
 * Get default cost values
 * 
 * @returns {Object} - Default cost object
 */
export function getDefaultCost() {
	return { ...DEFAULT_COST };
}

// BACKWARD COMPATIBILITY: Export functions with original names for external APIs
export const resolvePricing = resolveCost;
export const getPricingWithDefaults = getCostWithDefaults;
export const hasPricing = hasCost;
export const getAllPricing = getAllCost;
export const getDefaultPricing = getDefaultCost;
