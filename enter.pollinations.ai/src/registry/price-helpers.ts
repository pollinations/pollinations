/**
 * Helper utilities for price definitions in the registry
 * 
 * Provides:
 * - Unit conversion helpers (DPMT → DPT)
 * - Zero-price constants for free-tier models
 * - Cost-as-price helper for services that use provider costs directly
 */

import type { UsageConversionDefinition } from "@/registry/registry";

/**
 * Symbolic start date for zero-price pricing (January 1, 2020)
 * Represents the beginning of pricing history for free models
 */
export const ZERO_PRICE_START_DATE = new Date("2020-01-01 00:00:00").getTime();

/**
 * Convert dollars per million tokens to dollars per token
 * Makes it easier to write readable rates like $0.055 per million instead of 0.000000055
 * 
 * @param dpmt - Dollars per million tokens (e.g., 0.055 for $0.055 per 1M tokens)
 * @returns Dollars per token (e.g., 0.000000055)
 * 
 * @example
 * fromDPMT(0.055) // Returns 0.000000055 (GPT-5 Nano input rate)
 * fromDPMT(30) // Returns 0.00003 (Nanobanana image rate)
 */
export function fromDPMT(dpmt: number): number {
    return dpmt / 1_000_000;
}

/**
 * Single zero-price definition for all free-tier models
 * Works for both text and image models - only includes fields that are actually used
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

/**
 * Helper to use a model provider's cost as the service price
 * Used when a service charges exactly what the underlying provider costs
 * 
 * @param model - The model provider object with a cost property
 * @returns The model's cost array to use as price
 */
export function costAsPrice(
    model: { cost: UsageConversionDefinition[] },
): UsageConversionDefinition[] {
    return model.cost;
}
