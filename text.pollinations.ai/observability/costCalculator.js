import debug from "debug";
import { resolveCost as resolveCostFromModel } from '../modelCost.js';

const log = debug('text.pollinations.ai:costCalculator');

// Constant for token cost calculations
const TOKENS_PER_MILLION = 1000000;

/**
 * Resolve cost for a model based on the response model name
 * @param {string} responseModel - The model name from the LLM response
 * @returns {Object} - Cost object from modelCost.js
 * @throws {Error} - Throws error if no cost data is found
 */
export function resolveCost(responseModel) {
    // Use the new cost module to resolve cost by original name
    if (!responseModel) {
        throw new Error('No model name provided for cost resolution');
    }

    const cost = resolveCostFromModel(responseModel);
    log(`Resolved cost for response model: ${responseModel}`);
    return cost;
}


/**
 * Calculate the total cost for an LLM request based on token usage and pricing
 * @param {Object} tokenData - Token usage and pricing data
 * @param {number} tokenData.token_count_completion_text - Number of completion text tokens
 * @param {number} tokenData.token_count_completion_audio - Number of completion audio tokens
 * @param {number} tokenData.token_count_prompt_text - Number of prompt text tokens
 * @param {number} tokenData.token_count_prompt_audio - Number of prompt audio tokens
 * @param {number} tokenData.token_count_prompt_cached - Number of cached prompt tokens
 * @param {number} tokenData.token_price_completion_text - Price per million completion text tokens
 * @param {number} tokenData.token_price_completion_audio - Price per million completion audio tokens
 * @param {number} tokenData.token_price_prompt_text - Price per million prompt text tokens
 * @param {number} tokenData.token_price_prompt_audio - Price per million prompt audio tokens
 * @param {number} tokenData.token_price_prompt_cached - Price per million cached prompt tokens
 * @returns {number} - Total cost in dollars
 */
export function calculateTotalCost(tokenData) {
    
    const completionTextCost = (tokenData.token_count_completion_text * tokenData.token_price_completion_text) / TOKENS_PER_MILLION;
    const completionAudioCost = (tokenData.token_count_completion_audio * tokenData.token_price_completion_audio) / TOKENS_PER_MILLION;
    const promptTextCost = (tokenData.token_count_prompt_text * tokenData.token_price_prompt_text) / TOKENS_PER_MILLION;
    const promptAudioCost = (tokenData.token_count_prompt_audio * tokenData.token_price_prompt_audio) / TOKENS_PER_MILLION;
    const promptCachedCost = (tokenData.token_count_prompt_cached * tokenData.token_price_prompt_cached) / TOKENS_PER_MILLION;
    
    const totalCost = completionTextCost + completionAudioCost + promptTextCost + promptAudioCost + promptCachedCost;
    
    log(`💰 Cost breakdown: completion_text=$${completionTextCost.toFixed(6)}, completion_audio=$${completionAudioCost.toFixed(6)}, prompt_text=$${promptTextCost.toFixed(6)}, prompt_audio=$${promptAudioCost.toFixed(6)}, prompt_cached=$${promptCachedCost.toFixed(6)}, total=$${totalCost.toFixed(6)}`);
    
    return totalCost;
}


