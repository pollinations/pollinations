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
 * // Use in cost definitions
 * const cost = {
 *   promptTextTokens: perMillion(50),    // $50 per 1M tokens
 *   completionTextTokens: perMillion(200) // $200 per 1M tokens
 * };
 * ```
 */
export function perMillion(dollarsPerMillion: number): number {
    return dollarsPerMillion / 1_000_000;
}
