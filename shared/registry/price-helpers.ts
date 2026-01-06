import type { UsageConversionDefinition } from "./registry.ts";

/**
 * The start date when pricing was introduced.
 * All services use this date for their initial cost definitions.
 */
export const COST_START_DATE = new Date("2025-08-01 00:00:00").getTime();

/**
 * Converts dollars per million units to dollars per unit.
 *
 * @param dollarsPerMillion - The price in dollars per million units (tokens/images)
 * @returns The price in dollars per unit
 *
 * @example
 * ```ts
 * // Convert $50 per million tokens to dollars per token
 * const pricePerToken = perMillion(50); // 0.00005
 *
 * // Use in price definitions
 * const price = {
 *   promptTextTokens: perMillion(50),    // $50 per 1M tokens
 *   completionTextTokens: perMillion(200) // $200 per 1M tokens
 * };
 * ```
 */
export function perMillion(dollarsPerMillion: number): number {
    return dollarsPerMillion / 1_000_000;
}
