import debug from "debug";
import { TOKENS_PER_MILLION } from './constants.js';
import { validateTokenData } from './validation.js';

const log = debug("pollinations:cost-calculator");

/**
 * Calculate the total cost for an LLM request based on token usage and pricing
 * @param {Object} tokenData - Token usage and pricing data
 * @param {number} tokenData.completion_text_token_generated - Number of completion text tokens
 * @param {number} tokenData.completion_audio_token_generated - Number of completion audio tokens
 * @param {number} tokenData.prompt_text_token_generated - Number of prompt text tokens
 * @param {number} tokenData.prompt_audio_token_generated - Number of prompt audio tokens
 * @param {number} tokenData.prompt_cached_token_generated - Number of cached prompt tokens
 * @param {number} tokenData.completion_text_token_price - Price per million completion text tokens
 * @param {number} tokenData.completion_audio_token_price - Price per million completion audio tokens
 * @param {number} tokenData.prompt_text_token_price - Price per million prompt text tokens
 * @param {number} tokenData.prompt_audio_token_price - Price per million prompt audio tokens
 * @param {number} tokenData.prompt_cached_token_price - Price per million cached prompt tokens
 * @returns {number} - Total cost in dollars
 */
export function calculateTotalCost(tokenData) {
    validateTokenData(tokenData);
    
    const completionTextCost = (tokenData.completion_text_token_generated * tokenData.completion_text_token_price) / TOKENS_PER_MILLION;
    const completionAudioCost = (tokenData.completion_audio_token_generated * tokenData.completion_audio_token_price) / TOKENS_PER_MILLION;
    const promptTextCost = (tokenData.prompt_text_token_generated * tokenData.prompt_text_token_price) / TOKENS_PER_MILLION;
    const promptAudioCost = (tokenData.prompt_audio_token_generated * tokenData.prompt_audio_token_price) / TOKENS_PER_MILLION;
    const promptCachedCost = (tokenData.prompt_cached_token_generated * tokenData.prompt_cached_token_price) / TOKENS_PER_MILLION;
    
    const totalCost = completionTextCost + completionAudioCost + promptTextCost + promptAudioCost + promptCachedCost;
    
    log(`💰 Cost breakdown: completion_text=$${completionTextCost.toFixed(6)}, completion_audio=$${completionAudioCost.toFixed(6)}, prompt_text=$${promptTextCost.toFixed(6)}, prompt_audio=$${promptAudioCost.toFixed(6)}, prompt_cached=$${promptCachedCost.toFixed(6)}, total=$${totalCost.toFixed(6)}`);
    
    return totalCost;
}

/**
 * Calculate individual cost components for detailed analysis
 * @param {Object} tokenData - Token usage and pricing data
 * @returns {Object} - Breakdown of costs by component
 */
export function calculateCostBreakdown(tokenData) {
    validateTokenData(tokenData);
    
    return {
        completionTextCost: (tokenData.completion_text_token_generated * tokenData.completion_text_token_price) / TOKENS_PER_MILLION,
        completionAudioCost: (tokenData.completion_audio_token_generated * tokenData.completion_audio_token_price) / TOKENS_PER_MILLION,
        promptTextCost: (tokenData.prompt_text_token_generated * tokenData.prompt_text_token_price) / TOKENS_PER_MILLION,
        promptAudioCost: (tokenData.prompt_audio_token_generated * tokenData.prompt_audio_token_price) / TOKENS_PER_MILLION,
        promptCachedCost: (tokenData.prompt_cached_token_generated * tokenData.prompt_cached_token_price) / TOKENS_PER_MILLION,
    };
}
