/**
 * Function to get chat completion from Pollinations Text API.
 * If it takes longer than 5 seconds, returns the original prompt.
 * @param {string} prompt - The input prompt for the API.
 * @param {number} seed - The seed value for reproducible results.
 * @returns {Promise<string>} The chat completion response.
 */
async function pimpPromptRaw(prompt: string, seed: number): Promise<string> {
    return prompt;
}

// Memoize the pimpPrompt function
const memoize = (fn: (prompt: string, seed: number) => Promise<string>) => {
    const cache = new Map<string, string>();
    return async (prompt: string, seed: number) => {
        const cacheKey = `${prompt}-${seed}`;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        const result = await fn(prompt, seed);
        cache.set(cacheKey, result);
        return result;
    };
};

export const pimpPrompt = memoize(pimpPromptRaw);
