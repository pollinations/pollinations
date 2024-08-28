
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

    if (seed === -1) {
        seed = Math.floor(20 * Math.random());
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

    if (model !== "flux")// && model !== "turbo")
        model = "flux";
    return { width, height, seed, model, enhance, refine, nologo, negative_prompt, nofeed };
};


const idealSideLength = {
    turbo: 1024,
    flux: 768,
    deliberate: 640,
    dreamshaper: 800,
    formulaxl: 800,
    playground: 960,
    dpo: 768,
    dalle3xl: 768,
    realvis: 768,
};