import { MODELS } from "./models.ts";

/**
 * Sanitizes and adjusts parameters for image generation.
 * @param {{ width: number|null, height: number|null, seed: number|string, model: string, enhance: boolean|string, negative_prompt: string, nofeed: boolean|string, safe: boolean|string, quality: string, image: string|null, transparent: boolean|string, duration: number|string, aspectRatio: string, audio: boolean|string }} params
 * @returns {Object} - The sanitized parameters.
 */
export const makeParamsSafe = ({
    width = null,
    height = null,
    seed,
    model, // No default - gateway must provide valid model
    enhance,
    negative_prompt = "worst quality, blurry",
    nofeed = false,
    safe = false,
    private: isPrivate = false,
    quality = "medium",
    image = null,
    transparent = false,
    // Video-specific parameters (for veo model)
    duration = 4,
    aspectRatio = "16:9",
    audio = false,
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
    nofeed = sanitizeBoolean(nofeed) || sanitizeBoolean(isPrivate);
    safe = sanitizeBoolean(safe);
    transparent = sanitizeBoolean(transparent);
    audio = sanitizeBoolean(audio);

    // Validate video-specific parameters
    const validDurations = [4, 6, 8];
    duration = parseInt(duration, 10);
    if (!validDurations.includes(duration)) {
        duration = 4; // Default to cheapest: 4 seconds
    }

    const validAspectRatios = ["16:9", "9:16"];
    if (!validAspectRatios.includes(aspectRatio)) {
        aspectRatio = "16:9";
    }

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
    width = Number.isInteger(parseInt(width, 10))
        ? parseInt(width, 10)
        : defaultSideLength;
    height = Number.isInteger(parseInt(height, 10))
        ? parseInt(height, 10)
        : defaultSideLength;

    // Ensure seed is a valid integer within the allowed range
    const maxSeedValue = 1844674407370955;
    seed = Number.isInteger(parseInt(seed, 10)) ? parseInt(seed, 10) : 42;

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
        negative_prompt,
        nofeed,
        safe,
        quality,
        image: imageArray,
        transparent,
        // Video params
        duration,
        aspectRatio,
        audio,
    };
};
