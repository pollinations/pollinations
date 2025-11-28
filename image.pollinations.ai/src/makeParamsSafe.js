import { MODELS } from "./models.ts";

/**
 * Sanitizes and adjusts parameters for image generation.
 * @param {{ width: number|null, height: number|null, seed: number|string, model: string, enhance: boolean|string, nologo: boolean|string, negative_prompt: string, nofeed: boolean|string, safe: boolean|string, quality: string, image: string|null, transparent: boolean|string }} params
 * @returns {Object} - The sanitized parameters.
 */
export const makeParamsSafe = ({
    width = null,
    height = null,
    seed,
    model, // No default - gateway must provide valid model
    enhance,
    nologo = false,
    negative_prompt = "worst quality, blurry",
    nofeed = false,
    safe = false,
    private: isPrivate = false,
    quality = "medium",
    image = null,
    transparent = false,
}) => {
    // Sanitize boolean parameters - always return a boolean value
    const sanitizeBoolean = (value) => {
        // If it's already a boolean, return it directly
        if (typeof value === "boolean") return value;

        // For string values, only return true if it exactly equals "true" (case-insensitive)
        // All other values (including malformed strings like "falsee") will return false
        return value?.toString()?.toLowerCase?.() === "true";
    };

    enhance = sanitizeBoolean(enhance);
    nologo = sanitizeBoolean(nologo);
    nofeed = sanitizeBoolean(nofeed) || sanitizeBoolean(isPrivate);
    safe = sanitizeBoolean(safe);
    transparent = sanitizeBoolean(transparent);

    // Validate model is provided and allowed
    if (!model) {
        throw new Error("Model parameter is required");
    }
    const allowedModels = Object.keys(MODELS);
    if (!allowedModels.includes(model)) {
        throw new Error(
            `Invalid model: ${model}. Allowed models: ${allowedModels.join(", ")}`,
        );
    }

    const defaultSideLength = MODELS[model].defaultSideLength ?? 1024;

    // Use provided dimensions or default - no scaling/limiting
    width = Number.isInteger(parseInt(width))
        ? parseInt(width)
        : defaultSideLength;
    height = Number.isInteger(parseInt(height))
        ? parseInt(height)
        : defaultSideLength;

    // Ensure seed is a valid integer within the allowed range
    const maxSeedValue = 1844674407370955;
    seed = Number.isInteger(parseInt(seed)) ? parseInt(seed) : 42;

    if (seed < 0 || seed > maxSeedValue) {
        seed = 42;
    }

    // Validate quality parameter - only allow specific values
    const validQualities = ["low", "medium", "high", "hd"];
    if (!validQualities.includes(quality)) {
        quality = "medium";
    }

    // Process image parameter - support for multiple image URLs separated by pipe (|) or comma (,)
    // Always convert to array for consistency (empty array if null/undefined)
    const imageArray = image
        ? image.includes?.("|")
            ? image.split?.("|")
            : image.split?.(",")
        : [];

    return {
        width,
        height,
        seed,
        model,
        enhance,
        nologo,
        negative_prompt,
        nofeed,
        safe,
        quality,
        image: imageArray,
        transparent,
    };
};
