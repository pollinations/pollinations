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
 * @param {string} [options.apiKey] - Optional API key for authentication.
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
        if (!prompt) return "";

        const params = new URLSearchParams();
        params.set("width", width.toString());
        params.set("height", height.toString());
        params.set("seed", seed.toString());
        params.set("model", model);
        if (nologo) params.set("nologo", "true");
        if (enhance) params.set("enhance", "true");
        if (apiKey) params.set("token", apiKey);

        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, width, height, model, seed, nologo, enhance, apiKey]);

    return imageUrl;
};

export default usePollinationsImage;
