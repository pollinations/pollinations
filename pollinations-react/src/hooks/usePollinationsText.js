import { useMemo } from 'react';

/**
 * Custom hook to generate a Pollinations text URL based on the given prompt.
 * 
 * @param {string} prompt - The prompt to generate the text.
 * @param {number} [seed=-1] - The seed for random text generation.
 * @returns {string} - The URL of the generated text.
 */
const usePollinationsText = (prompt, seed = -1) => {
    // Memoize the effective seed so it does not change every render
    const effectiveSeed = useMemo(() => {
        return seed === -1 ? Math.floor(Math.random() * 20) + 1 : seed;
    }, [seed]);

    const textUrl = useMemo(() => {
        const params = new URLSearchParams({ seed: effectiveSeed });
        return `https://text.pollinations.ai/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, effectiveSeed]);

    return textUrl;
};

export default usePollinationsText;