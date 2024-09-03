import { MODELS, idealSideLength } from './models.js';

/**
 * Sanitizes and adjusts parameters for image generation.
 * @param {{ width: number|null, height: number|null, seed: number|string, model: string, enhance: boolean|string, refine: boolean|string, nologo: boolean|string, negative_prompt: string, nofeed: boolean|string }} params
 * @returns {Object} - The sanitized parameters.
 */
export const makeParamsSafe = ({ width = null, height = null, seed, model = "flux", enhance = false, refine = false, nologo = false, negative_prompt = "worst quality, blurry", nofeed = false }) => {
    // Sanitize boolean parameters
    const sanitizeBoolean = (value) => value?.toLowerCase?.() === "true" ? true : value?.toLowerCase?.() === "false" ? false : value;
    refine = sanitizeBoolean(refine);
    enhance = sanitizeBoolean(enhance);
    nologo = sanitizeBoolean(nologo);
    nofeed = sanitizeBoolean(nofeed);

    const sideLength = idealSideLength[model] || idealSideLength["turbo"];
    const maxPixels = sideLength * sideLength;

    // Ensure width and height are integers or default to sideLength
    width = Number.isInteger(parseInt(width)) ? parseInt(width) : 768;
    height = Number.isInteger(parseInt(height)) ? parseInt(height) : 768;

    // Ensure seed is a valid integer within the allowed range
    const maxSeedValue = 18446744073709551500;
    seed = Number.isInteger(parseInt(seed)) ? parseInt(seed) : 42;

    // we want to disable the cache for the random images with seed -1
    let disableCache = false;
    if (seed === -1) {
        seed = Math.floor(20 * Math.random());
        disableCache = true;
    }

    else if (seed < 0 || seed > maxSeedValue) {
        seed = 42;
    }

    // Adjust dimensions to maintain aspect ratio if exceeding maxPixels
    if (width * height > maxPixels) {
        const ratio = Math.sqrt(maxPixels / (width * height));
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
    }

    // Ensure model is one of the allowed models or default to "flux"
    const allowedModels = Object.keys(MODELS);
    if (!allowedModels.includes(model)) {
        model = "flux";
    }

    return { width, height, seed, model, enhance, refine, nologo, negative_prompt, nofeed, disableCache };
};