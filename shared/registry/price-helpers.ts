import type { UsageConversionDefinition } from "./registry.ts";

/**
 * The start date for zero pricing (legacy period).
 * All services before this date had zero cost.
 */
export const ZERO_PRICE_START_DATE = new Date("2020-01-01 00:00:00").getTime();

/**
 * The start date when pricing was introduced.
 * Services after this date may have associated costs.
 */
export const PRICING_START_DATE = new Date("2025-08-01 00:00:00").getTime();

/**
 * Converts Dollars Per Million Tokens (DPMT) to dollars per token.
 * 
 * @param dpmt - The price in dollars per million tokens
 * @returns The price in dollars per token
 * 
 * @example
 * ```ts
 * // Convert $50 per million tokens to dollars per token
 * const pricePerToken = fromDPMT(50); // 0.00005
 * 
 * // Use in price definitions
 * const price = {
 *   promptTextTokens: fromDPMT(50),    // $50 per 1M tokens
 *   completionTextTokens: fromDPMT(200) // $200 per 1M tokens
 * };
 * ```
 */
export function fromDPMT(dpmt: number): number {
    return dpmt / 1_000_000;
}

/**
 * A zero-cost price definition for free services.
 * All token types are set to 0.0 cost.
 * 
 * @example
 * ```ts
 * // Use for free service definitions
 * const freeService = {
 *   displayName: "Free Service",
 *   price: [ZERO_PRICE]
 * };
 * ```
 */
export const ZERO_PRICE: UsageConversionDefinition = {
    date: ZERO_PRICE_START_DATE,
    promptTextTokens: 0.0,
    promptCachedTokens: 0.0,
    completionTextTokens: 0.0,
    promptAudioTokens: 0.0,
    completionAudioTokens: 0.0,
    completionImageTokens: 0.0,
};
