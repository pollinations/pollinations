import { MIN_TOKEN_COUNT, MAX_TOKEN_COUNT, MIN_COST, MAX_COST } from './constants.js';

/**
 * Validate token data object for cost calculations
 * @param {Object} tokenData - Token usage and pricing data
 * @throws {Error} If validation fails
 */
export function validateTokenData(tokenData) {
    if (!tokenData || typeof tokenData !== 'object') {
        throw new Error('Invalid tokenData: must be an object');
    }

    const requiredFields = [
        'completion_text_token_generated',
        'completion_audio_token_generated', 
        'prompt_text_token_generated',
        'prompt_audio_token_generated',
        'prompt_cached_token_generated',
        'completion_text_token_price',
        'completion_audio_token_price',
        'prompt_text_token_price',
        'prompt_audio_token_price',
        'prompt_cached_token_price'
    ];

    for (const field of requiredFields) {
        if (!(field in tokenData)) {
            throw new Error(`Missing required field: ${field}`);
        }
        
        const value = tokenData[field];
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new Error(`Invalid ${field}: must be a finite number`);
        }

        // Token counts validation
        if (field.includes('token_generated')) {
            if (value < MIN_TOKEN_COUNT || value > MAX_TOKEN_COUNT) {
                throw new Error(`Invalid ${field}: must be between ${MIN_TOKEN_COUNT} and ${MAX_TOKEN_COUNT}`);
            }
        }

        // Pricing validation
        if (field.includes('token_price')) {
            if (value < MIN_COST) {
                throw new Error(`Invalid ${field}: must be non-negative`);
            }
        }
    }
}

/**
 * Safely clamp a number within bounds
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
