import debug from "debug";
import { getModelDefinition } from "../../shared/registry/registry.js";

const log = debug("text.pollinations.ai:costCalculator");

// Constant for token cost calculations
const _TOKENS_PER_MILLION = 1000000;

/** Cost rates per token type */
export interface CostRates {
    prompt_text: number;
    completion_text: number;
    prompt_cache: number;
    prompt_audio: number;
    completion_audio: number;
}

/** Token usage and pricing data for cost calculation */
export interface TokenData {
    token_count_completion_text: number;
    token_count_completion_audio: number;
    token_count_prompt_text: number;
    token_count_prompt_audio: number;
    token_count_prompt_cached: number;
    token_price_completion_text: number;
    token_price_completion_audio: number;
    token_price_prompt_text: number;
    token_price_prompt_audio: number;
    token_price_prompt_cached: number;
}

/**
 * Resolve cost for a model based on the response model name
 * @param responseModel - The model name from the LLM response
 * @returns Cost object with pricing per token type
 * @throws Error if no cost data is found
 */
export function resolveCost(responseModel: string): CostRates {
    if (!responseModel) {
        throw new Error("No model name provided for cost resolution");
    }

    const costs = getModelDefinition(responseModel);
    if (!costs) {
        throw new Error(
            `Missing cost data for model "${responseModel}". Please contact support@pollinations.ai`,
        );
    }

    // Get the latest cost definition (last in array after sorting by date)
    const latestCost = costs[costs.length - 1];

    const cost: CostRates = {
        prompt_text: latestCost.promptTextTokens ?? 0,
        completion_text: latestCost.completionTextTokens ?? 0,
        prompt_cache: latestCost.promptCachedTokens ?? 0,
        prompt_audio:
            ("promptAudioTokens" in latestCost
                ? latestCost.promptAudioTokens
                : undefined) ?? 0,
        completion_audio:
            ("completionAudioTokens" in latestCost
                ? latestCost.completionAudioTokens
                : undefined) ?? 0,
    };

    log(`Resolved cost for response model: ${responseModel}`);
    return cost;
}

/**
 * Calculate the total cost for an LLM request based on token usage and pricing
 * @param tokenData - Token usage and pricing data
 * @returns Total cost in dollars
 */
export function calculateTotalCost(tokenData: TokenData): number {
    // Note: token_price_* values are already in dollars per token (from fromDPMT)
    // So we just multiply tokens × price, no division needed
    const completionTextCost =
        tokenData.token_count_completion_text *
        tokenData.token_price_completion_text;
    const completionAudioCost =
        tokenData.token_count_completion_audio *
        tokenData.token_price_completion_audio;
    const promptTextCost =
        tokenData.token_count_prompt_text * tokenData.token_price_prompt_text;
    const promptAudioCost =
        tokenData.token_count_prompt_audio * tokenData.token_price_prompt_audio;
    const promptCachedCost =
        tokenData.token_count_prompt_cached *
        tokenData.token_price_prompt_cached;

    const totalCost =
        completionTextCost +
        completionAudioCost +
        promptTextCost +
        promptAudioCost +
        promptCachedCost;

    log(
        `💰 Cost breakdown: completion_text=$${completionTextCost.toFixed(6)}, completion_audio=$${completionAudioCost.toFixed(6)}, prompt_text=$${promptTextCost.toFixed(6)}, prompt_audio=$${promptAudioCost.toFixed(6)}, prompt_cached=$${promptCachedCost.toFixed(6)}, total=$${totalCost.toFixed(6)}`,
    );

    return totalCost;
}
