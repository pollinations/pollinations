import { useMemo } from "react";

/**
 * Custom hook to generate a Pollinations image URL based on the given prompt and options.
 *
 * @param {string} prompt - The prompt to generate the image.
 * @param {Object} [options] - Optional parameters for image generation.
 * @param {number} [options.width=1024] - The width of the generated image.
 * @param {number} [options.height=1024] - The height of the generated image.
 * @param {string} [options.model='flux'] - The model to use for image generation.
 * @param {number} [options.seed=42] - The seed for random image generation.
 * @param {boolean} [options.nologo=true] - Whether to generate the image without a logo.
 * @param {boolean} [options.enhance=false] - Whether to enhance the generated image.
 * @param {string} [options.apiKey] - API key for enter.pollinations.ai (required).
 * @returns {string} - The URL of the generated image.
 */
const usePollinationsImage = (prompt, options = {}) => {
    const {
        width = 1024,
        height = 1024,
        model = "flux",
        seed = 42,
        nologo = true,
        enhance = false,
        apiKey,
    } = options;

    const imageUrl = useMemo(() => {
        const params = new URLSearchParams();
        
        if (model !== "flux") params.set("model", model);
        if (width !== 1024) params.set("width", width.toString());
        if (height !== 1024) params.set("height", height.toString());
        if (seed !== 42) params.set("seed", seed.toString());
        if (nologo) params.set("nologo", "true");
        if (enhance) params.set("enhance", "true");
        if (apiKey) params.set("key", apiKey);

        return `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, width, height, model, seed, nologo, enhance, apiKey]);

    return imageUrl;
};

export default usePollinationsImage;
