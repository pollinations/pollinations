import debug from "debug";
import { availableModels } from "../availableModels.js";

const TOKENS_PER_MILLION = 1_000_000;

const log = debug("pollinations:cost-calculator");

/**
 * Simple pricing resolution: only try response model, no fallback
 * @param {string|null} responseModel - The model name from LLM response
 * @returns {Object|null} - Pricing object from availableModels.js or null if not found
 */
export function resolvePricing(responseModel) {
    // Only try to find pricing using response model (match by original_name)
    if (responseModel) {
        const modelByOriginalName = availableModels.find(m => m.original_name === responseModel);
        if (modelByOriginalName && modelByOriginalName.pricing) {
            log(`Using response model for pricing: ${responseModel} -> ${modelByOriginalName.name}`);
            return modelByOriginalName.pricing;
        }
    }
    
    log(`No pricing found for response model: ${responseModel}`);
    return null;
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


