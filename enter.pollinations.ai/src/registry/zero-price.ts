/**
 * Reusable zero-price definitions for free-tier models and services
 * 
 * Use these constants to avoid boilerplate when defining zero-price models.
 * The symbolic start date represents "beginning of time" for pricing history.
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
 * Zero-price definition for text models (all token types)
 * Includes: prompt text, cached prompt, completion text, prompt audio, completion audio
 */
export const ZERO_PRICE_TEXT: UsageConversionDefinition = {
    date: ZERO_PRICE_START_DATE,
    promptTextTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    promptCachedTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    completionTextTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    promptAudioTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    completionAudioTokens: {
        unit: "DPT",
        rate: 0.0,
    },
};

/**
 * Zero-price definition for image models
 */
export const ZERO_PRICE_IMAGE: UsageConversionDefinition = {
    date: ZERO_PRICE_START_DATE,
    completionImageTokens: {
        unit: "DPT",
        rate: 0.0,
    },
};

/**
 * Zero-price definition combining all token types (text + image + audio)
 * Use this for services that might handle multiple modalities
 */
export const ZERO_PRICE_ALL: UsageConversionDefinition = {
    date: ZERO_PRICE_START_DATE,
    promptTextTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    promptCachedTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    completionTextTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    promptAudioTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    completionAudioTokens: {
        unit: "DPT",
        rate: 0.0,
    },
    completionImageTokens: {
        unit: "DPT",
        rate: 0.0,
    },
};
