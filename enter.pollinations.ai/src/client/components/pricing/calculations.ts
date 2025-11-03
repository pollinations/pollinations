/**
 * Pollen calculation utilities
 */

import type { ModelPrice } from "./types.ts";
import { getModalities } from "./model-info.ts";

// ============================================================================
// POLLEN STANDARD CONSTANTS
// ============================================================================
// Used to calculate "Per Pollen" values based on OUTPUT generated

/** Text output tokens per average response (~250 words, typical chat response) */
const RESPONSE_OUT_TOKENS = 350;

/** Format large numbers with K/M abbreviations */
function formatLargeNumber(num: number): string {
    const rounded = Math.round(num / 10) * 10;
    
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

/** Audio output tokens per second (balanced encoding) */
const AUDIO_OUT_TOKENS_PER_SEC = 1000;

/**
 * Calculate "Per Pollen" value for a model.
 * Returns human-readable capacity (e.g., "500", "25", "2.3 min", "∞")
 * 
 * Logic:
 * - Free models: "∞"
 * - Text models: number only (unit in column header)
 * - Image models: number only (unit in column header)
 * - Audio models: number + "min" (exception, different unit in same table)
 * - Multimodal: use principal media type
 */
export const calculatePerPollen = (model: ModelPrice): string => {
    const modalities = getModalities(model.name, model.type);
    const primaryOutput = modalities.output[0];

    // Rule 1: Text Models → "responses per pollen" (output only)
    if (model.type === "text" && primaryOutput === "text") {
        const completionPrice = parseFloat(model.completionTextPrice || "0");
        
        if (completionPrice === 0) return "—";
        
        // Cost per average response OUTPUT (completion only)
        const costPerResponse = (completionPrice * RESPONSE_OUT_TOKENS) / 1_000_000;
        
        if (costPerResponse === 0) return "∞";
        
        const responsesPerPollen = 1 / costPerResponse;
        return formatLargeNumber(responsesPerPollen);
    }

    // Rule 3: Audio Models → "minutes per pollen" (output only)
    if (model.type === "text" && primaryOutput === "audio") {
        const audioOutPrice = parseFloat(model.completionAudioTokens || "0");
        
        if (audioOutPrice === 0) return "∞";
        
        // TTS: cost per minute of generated audio
        const costPerMinute = (audioOutPrice * AUDIO_OUT_TOKENS_PER_SEC * 60) / 1_000_000;
        
        if (costPerMinute === 0) return "∞";
        
        const minutesPerPollen = 1 / costPerMinute;
        return `${minutesPerPollen.toFixed(1)} min`;
    }

    // Rule 2: Image Models → "images per pollen"
    if (model.type === "image") {
        // Case 1: Per-image pricing (direct cost)
        if (model.perImagePrice) {
            const costPerImage = parseFloat(model.perImagePrice);
            if (costPerImage === 0) return "∞";
            
            const imagesPerPollen = 1 / costPerImage;
            return formatLargeNumber(imagesPerPollen);
        }
        
        // Case 2: Per-token pricing (e.g., gptimage)
        // Token count varies based on image size and complexity
        // Using empirical average for 1024x1024 standard size
        if (model.perToken && model.completionImagePrice) {
            const tokenPrice = parseFloat(model.completionImagePrice);
            
            // Empirical average: ~1300 tokens for 1024x1024 image
            // Based on 9 test samples: median=1066, mean=1365, using conservative 1300
            const avgTokensPer1024 = 1300;
            const costPerImage = (tokenPrice * avgTokensPer1024) / 1_000_000;
            
            if (costPerImage === 0) return "∞";
            
            const imagesPerPollen = 1 / costPerImage;
            return formatLargeNumber(imagesPerPollen);
        }
    }

    return "—";
};
