import { MODELS } from './models.js';

/**
 * Sanitizes and adjusts parameters for image generation.
 * @param {{ width: number|null, height: number|null, seed: number|string, model: string, enhance: boolean|string, nologo: boolean|string, negative_prompt: string, nofeed: boolean|string, safe: boolean|string }} params
 * @returns {Object} - The sanitized parameters.
 */
export const makeParamsSafe = ({ width = null, height = null, seed, model = "flux", enhance, nologo = false, negative_prompt = "worst quality, blurry", nofeed = false, safe = false, private:isPrivate = false }) => {
    // Sanitize boolean parameters
    const sanitizeBoolean = (value) => value?.toLowerCase?.() === "true" ? true : value?.toLowerCase?.() === "false" ? false : value;
    enhance = sanitizeBoolean(enhance);
    nologo = sanitizeBoolean(nologo);
    nofeed = sanitizeBoolean(nofeed) || sanitizeBoolean(isPrivate);
    safe = sanitizeBoolean(safe);

    // Ensure model is one of the allowed models or default to "flux"
    const allowedModels = Object.keys(MODELS);
    if (!allowedModels.includes(model)) {
        model = "flux";
    }

    const sideLength = MODELS[model].maxSideLength;
    const maxPixels = sideLength * sideLength;

    // Ensure width and height are integers or default to sideLength
    width = Number.isInteger(parseInt(width)) ? parseInt(width) : Math.min(1024, sideLength);
    height = Number.isInteger(parseInt(height)) ? parseInt(height) : Math.min(1024, sideLength);

    // Ensure seed is a valid integer within the allowed range
    const maxSeedValue = 1844674407370955;
    seed = Number.isInteger(parseInt(seed)) ? parseInt(seed) : 42;

    if (seed < 0 || seed > maxSeedValue) {
        seed = 42;
    }

    // // Adjust dimensions to maintain aspect ratio if exceeding maxPixels
    if (width * height > maxPixels) {
        const ratio = Math.sqrt(maxPixels / (width * height));
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
    }

    return { width, height, seed, model, enhance, nologo, negative_prompt, nofeed, safe };
};