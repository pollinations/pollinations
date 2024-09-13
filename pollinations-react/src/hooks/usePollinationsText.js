import { useMemo, useState, useEffect } from 'react';

/**
 * Custom hook to generate a Pollinations text URL based on the given prompt and fetch the text.
 * 
 * @param {string} prompt - The prompt to generate the text.
 * @param {number} [seed=-1] - The seed for random text generation.
 * @returns {string} - The fetched and cleaned text.
 */
const usePollinationsText = (prompt, seed = -1) => {
    const [text, setText] = useState("");
    const cache = useMemo(() => new Map(), []);

    // Memoize the effective seed so it does not change every render
    const effectiveSeed = useMemo(() => {
        return seed === -1 ? Math.floor(Math.random() * 20) + 1 : seed;
    }, [seed]);

    const textUrl = useMemo(() => {
        const params = new URLSearchParams({ seed: effectiveSeed });
        return `https://text.pollinations.ai/${encodeURIComponent(prompt)}?${params.toString()}`;
    }, [prompt, effectiveSeed]);

    useEffect(() => {
        if (cache.has(textUrl)) {
            setText(cache.get(textUrl));
        } else {
            fetch(textUrl)
                .then((response) => response.text())
                .then((data) => {
                    const cleanedData = cleanMarkdown(data);
                    cache.set(textUrl, cleanedData);
                    setText(cleanedData);
                })
                .catch((error) => {
                    console.error("Error fetching text:", error);
                    throw error;
                });
        }
    }, [textUrl, cache]);

    return text;
};

/**
 * Function to clean markdown data by extracting text between triple backticks.
 * 
 * @param {string} data - The markdown data to clean.
 * @returns {string} - The cleaned markdown data.
 */
const cleanMarkdown = (data) => {
    const regex = /```([\s\S]*?)```/;
    const match = data.match(regex);
    return match ? match[1] : data;
};

export default usePollinationsText;