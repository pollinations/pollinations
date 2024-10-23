import React, { useMemo } from 'react';

/**
 * Custom hook to generate a Pollinations image URL based on the given prompt and options.
 * 
 * @param {string} prompt - The prompt to generate the image.
 * @param {Object} [options] - Optional parameters for image generation.
 * @param {number} [options.width=1024] - The width of the generated image.
 * @param {number} [options.height=1024] - The height of the generated image.
 * @param {string} [options.model='turbo'] - The model to use for image generation.
 * @param {number} [options.seed=-1] - The seed for random image generation.
 * @param {boolean} [options.nologo=true] - Whether to generate the image without a logo.
 * @param {boolean} [options.enhance=false] - Whether to enhance the generated image.
 * @returns {string} - The URL of the generated image.
 */
const usePollinationsImage = (prompt, options = {}) => {
    const { width = 1024, height = 1024, model = 'flux', seed = 42, nologo = true, enhance = false } = options;

    const imageUrl = useMemo(() => {
        const params = new URLSearchParams({ width, height, model, seed, nologo, enhance });
        return `https://pollinations.ai/p/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, width, height, model, seed, nologo, enhance]);

    return imageUrl;
};

export default usePollinationsImage;
