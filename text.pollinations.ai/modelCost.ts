/**
 * Model cost data and resolution functions
 * 
 * This module provides a legacy-compatible interface to the shared registry.
 * All cost data now comes from ../shared/registry/text.ts
 */

import debug from 'debug';
import { TEXT_COSTS } from '../shared/registry/text';
import { getProviderByModelId, type UsageConversionDefinition } from '../shared/registry/registry';

const log = debug('text.pollinations.ai:modelCost');

// Legacy cost format for backward compatibility
interface LegacyCost {
	provider: string;
	region: string; // Kept for backward compatibility but not actively used
	prompt_text: number;
	prompt_cache?: number;
	prompt_audio?: number;
	completion_text: number;
	completion_audio?: number;
	prompt_cache_write?: number;
}

/**
 * Convert registry cost format to legacy format
 */
function convertToLegacyFormat(modelId: string): LegacyCost | null {
	const costs = TEXT_COSTS[modelId as keyof typeof TEXT_COSTS];
	if (!costs) {
		return null;
	}
	
	// Get the latest cost definition (last in array after sorting by date)
	const latestCost = costs[costs.length - 1] as UsageConversionDefinition;
	
	const legacyCost: LegacyCost = {
		provider: getProviderByModelId(modelId) || 'unknown',
		region: 'unknown', // Region not used, kept for backward compatibility
		prompt_text: latestCost.promptTextTokens ?? 0,
		completion_text: latestCost.completionTextTokens ?? 0,
	};
	
	// Add optional fields if they exist
	if (latestCost.promptCachedTokens) {
		legacyCost.prompt_cache = latestCost.promptCachedTokens;
	}
	if (latestCost.promptAudioTokens) {
		legacyCost.prompt_audio = latestCost.promptAudioTokens;
	}
	if (latestCost.completionAudioTokens) {
		legacyCost.completion_audio = latestCost.completionAudioTokens;
	}
	
	return legacyCost;
}

/**
 * Resolve cost for a model by its original name
 * 
 * @param originalName - The original model name returned by the LLM provider
 * @returns Cost object with defaults applied
 * @throws Error if no cost data is found
 */
export function resolveCost(originalName: string): LegacyCost {
	if (!originalName) {
		throw new Error('Missing cost data. Please contact support@pollinations.ai');
	}

	const cost = getCost(originalName);
	if (cost) {
		log(`Resolved cost for ${originalName}`);
		return cost;
	}

	throw new Error(`Missing cost data for model "${originalName}". Please contact support@pollinations.ai`);
}

/**
 * Get cost data for a model (internal helper)
 * 
 * @param originalName - The original model name
 * @returns Cost object or null if not found
 */
function getCost(originalName: string): LegacyCost | null {
	return convertToLegacyFormat(originalName);
}

/**
 * Get provider for a model by its original name
 * 
 * @param originalName - The original model name
 * @returns Provider name or null if not found
 */
export function getProvider(originalName: string): string | null {
	const costData = getCost(originalName);
	return costData?.provider || null;
}


