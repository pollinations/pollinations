import { useMemo } from 'react';

/**
 * Custom hook to generate a Pollinations text URL based on the given prompt.
 * 
 * @param {string} prompt - The prompt to generate the text.
 * @param {number} [seed=-1] - The seed for random text generation.
 * @returns {string} - The URL of the generated text.
 */
const usePollinationsText = (prompt, seed = -1) => {
    const textUrl = useMemo(() => {
        const params = new URLSearchParams({ seed });
        return `https://text.pollinations.ai/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, seed]);

    return textUrl;
};

export default usePollinationsText;