/**
 * Pollen calculation utilities
 */

import { getModalities, hasReasoning, hasVision } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

// ============================================================================
// WORKLOAD PROFILES
// ============================================================================
// Representative token counts for typical use cases, auto-selected by model capabilities
// These define "standard" usage patterns to calculate per-pollen capacity

// Token-to-word ratio: ~1.3 tokens per word (English average)
const TOKENS_PER_WORD = 1.3;

/** Base chat workload (standard text conversation) */
const WORKLOAD_CHAT = {
    input: 50, // ~40 words typical prompt
    output: Math.round(150 * TOKENS_PER_WORD), // ~150 words typical response
};

/** Reasoning workload (models with reasoning capabilities) */
const WORKLOAD_REASONING = {
    input: 50, // Same prompt size
    output: Math.round(300 * TOKENS_PER_WORD), // ~300 words (longer, detailed)
    reasoning: Math.round(230 * TOKENS_PER_WORD), // ~230 words reasoning overhead
};

/**
 * Vision workload - OpenAI tile calculation for standard 1024×1024 image
 * Formula: base_tokens + (tokens_per_tile × num_tiles)
 * - Image resized to fit 2048×2048 square
 * - Divided into 512×512 tiles
 * - 1024×1024 = 2×2 = 4 tiles
 * Source: https://platform.openai.com/docs/guides/vision
 */
const IMAGE_TOKENS_1024 =
    85 + 170 * Math.ceil(1024 / 512) * Math.ceil(1024 / 512);

/**
 * Model-specific image token counts for 1024×1024 images
 * Different providers use different token counting methods
 */
const MODEL_IMAGE_TOKENS: Record<string, number> = {
    "gptimage": IMAGE_TOKENS_1024, // 765 tokens (OpenAI tile calculation)
    "nanobanana": 1290, // 1290 tokens (Vertex AI Gemini actual usage)
};

/**
 * Audio pricing per minute (OpenAI realtime API rates)
 * Fixed per-minute costs, not token-based
 * Source: https://platform.openai.com/docs/guides/realtime
 */
const AUDIO_COST_PER_MIN = {
    input: 0.06, // USD per minute of input audio
    output: 0.24, // USD per minute of output audio (TTS)
};

/** Format large numbers with K/M abbreviations */
function formatLargeNumber(num: number): string {
    // Less aggressive rounding for smaller numbers
    let rounded: number;
    if (num < 50) {
        // Round to nearest 5 for numbers under 50
        rounded = Math.round(num / 5) * 5;
    } else {
        // Round to nearest 10 for larger numbers
        rounded = Math.round(num / 10) * 10;
    }

    if (rounded >= 1_000_000) {
        const millions = rounded / 1_000_000;
        return `${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
    }

    if (rounded >= 1_000) {
        const thousands = rounded / 1_000;
        return `${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`;
    }

    return `${rounded}`;
}

/**
 * Calculate "Per Pollen" value for a model using workload profiles.
 * Automatically selects profile based on model capabilities.
 *
 * Returns human-readable capacity:
 * - Text models: "500" (responses)
 * - Image models: "50" (images)
 * - Audio models: "25.3 min" (minutes of audio)
 */
export const calculatePerPollen = (model: ModelPrice): string => {
    const modalities = getModalities(model.name);
    const primaryOutput = modalities.output[0];

    // ========================================================================
    // TEXT MODELS
    // ========================================================================
    if (model.type === "text" && primaryOutput === "text") {
        const inputPrice = parseFloat(model.promptTextPrice || "0");
        const outputPrice = parseFloat(model.completionTextPrice || "0");

        if (inputPrice === 0 && outputPrice === 0) return "—";

        // Auto-select workload based on capabilities
        const isReasoning = hasReasoning(model.name);
        const workload = isReasoning ? WORKLOAD_REASONING : WORKLOAD_CHAT;

        // Full cost formula: input + output + reasoning (if applicable)
        let costPerRequest =
            (inputPrice * workload.input + outputPrice * workload.output) /
            1_000_000;

        // Add reasoning tokens if model supports it
        if (isReasoning) {
            const reasoningPrice = parseFloat(model.completionTextPrice || "0"); // Same as output for now
            costPerRequest +=
                (reasoningPrice * WORKLOAD_REASONING.reasoning) / 1_000_000;
        }

        // Add vision tokens if model supports it
        if (hasVision(model.name) && model.promptImagePrice) {
            const imagePrice = parseFloat(model.promptImagePrice);
            costPerRequest += (imagePrice * IMAGE_TOKENS_1024) / 1_000_000;
        }

        if (costPerRequest === 0) return "—";

        const requestsPerPollen = 1 / costPerRequest;
        return formatLargeNumber(requestsPerPollen);
    }

    // ========================================================================
    // AUDIO MODELS (TTS/Realtime)
    // ========================================================================
    if (model.type === "text" && primaryOutput === "audio") {
        // Use per-minute pricing directly
        const minutesPerPollen = 1 / AUDIO_COST_PER_MIN.output;
        return `${minutesPerPollen.toFixed(1)} min`;
    }

    // ========================================================================
    // VIDEO MODELS
    // ========================================================================
    if (model.type === "video") {
        // Token-based video pricing (e.g., seedance)
        if (model.perToken && model.perTokenPrice) {
            const tokenPrice = parseFloat(model.perTokenPrice);
            if (tokenPrice === 0) return "—";

            // Seedance token formula: (height × width × FPS × duration) / 1024
            // For 720p 2s video: (720 × 1280 × 24 × 2) / 1024 ≈ 43,200 tokens
            const SEEDANCE_TOKENS_2S_720P = 43200;
            const costPerVideo =
                (tokenPrice * SEEDANCE_TOKENS_2S_720P) / 1_000_000;
            const videosPerPollen = 1 / costPerVideo;
            return formatLargeNumber(videosPerPollen);
        }

        // Second-based video pricing (e.g., veo)
        if (model.perSecondPrice) {
            const costPerSecond = parseFloat(model.perSecondPrice);
            if (costPerSecond === 0) return "—";

            // Show seconds per pollen (no suffix - column header shows "seconds")
            const secondsPerPollen = 1 / costPerSecond;
            return secondsPerPollen.toFixed(1);
        }
    }

    // ========================================================================
    // IMAGE MODELS
    // ========================================================================
    if (model.type === "image") {
        // Case 1: Per-image pricing (direct cost)
        if (model.perImagePrice) {
            const costPerImage = parseFloat(model.perImagePrice);
            if (costPerImage === 0) return "—";

            const imagesPerPollen = 1 / costPerImage;
            return formatLargeNumber(imagesPerPollen);
        }

        // Case 2: Per-token pricing (e.g., gptimage, nanobanana)
        if (model.perToken && model.completionImagePrice) {
            const tokenPrice = parseFloat(model.completionImagePrice);

            // Use model-specific token count, fallback to OpenAI calculation
            const tokenCount =
                MODEL_IMAGE_TOKENS[model.name] || IMAGE_TOKENS_1024;
            const costPerImage = (tokenPrice * tokenCount) / 1_000_000;

            if (costPerImage === 0) return "—";

            const imagesPerPollen = 1 / costPerImage;
            return formatLargeNumber(imagesPerPollen);
        }
    }

    return "—";
};
