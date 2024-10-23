import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import memoize from 'lodash.memoize';

/**
 * Custom hook to generate text using the Pollinations API.
 * 
 * This hook encapsulates the logic for making a POST request to the Pollinations text generation API,
 * handling memoization, and cleaning the received markdown data.
 * 
 * @param {string} prompt - The user's input prompt for text generation.
 * @param {Object} options - Configuration options for text generation.
 * @param {number} [options.seed=-1] - Seed for deterministic text generation. -1 for random.
 * @param {string} [options.systemPrompt] - Optional system prompt to guide the text generation.
 * @param {boolean} [options.jsonMode=false] - Whether to parse the response as JSON.
 * @param {boolean} [options.loadNull=false] - Whether to reset the text state to null before fetching new data.
 * @returns {Object} - An object containing the generated text and loading state.
 */
const usePollinationsText = (prompt, options = {}) => {
    // Destructure options with default values
    const { seed = 42, systemPrompt, model, jsonMode = false, loadNull = false } = options;

    // State to hold the generated text
    const [text, setText] = useState(null);

    // Ref to track the current fetch request
    const currentFetchRef = useRef(Promise.resolve());

    // Memoized request body
    const requestBody = useMemo(() => {
        const messages = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
        messages.push({ role: "user", content: prompt });
        return { messages, seed, model, jsonMode };
    }, [prompt, systemPrompt, seed, model, jsonMode]);

    // Memoized fetch function
    const fetchText = useCallback(() => {
        currentFetchRef.current = currentFetchRef.current
            .then(() => memoizedFetchPollinationsText(requestBody))
            .then(cleanedData => {
                setText(cleanedData);
            })
            .catch((error) => {
                console.error("Error in usePollinationsText:", error);
                setText(`An error occurred while generating text: ${error.message}. Please try again.`);
            });
    }, [requestBody]);

    // Effect to fetch or retrieve memoized text
    useEffect(() => {
        if (prompt === null) return;
        if (loadNull) setText(null);
        fetchText();
    }, [fetchText, loadNull, prompt]);

    return text;
};

/**
 * Function to fetch text from the Pollinations API.
 * 
 * @param {Object} requestBody - The request body for the API call.
 * @returns {Promise<string|Object>} - A promise that resolves to the cleaned text data or parsed JSON.
 */
const fetchPollinationsText = async (requestBody) => {
    try {
        const response = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        return requestBody.jsonMode ? JSON.parse(data) : cleanMarkdown(data);
    } catch (error) {
        console.error("Error fetching text from Pollinations API:", error);
        throw error;
    }
};

// Memoized version of fetchPollinationsText
const memoizedFetchPollinationsText = memoize(fetchPollinationsText, JSON.stringify);

/**
 * Helper function to clean markdown data.
 * 
 * This function extracts text between triple backticks, which is typically
 * used to denote code blocks in markdown. If no such block is found,
 * it returns the original data.
 * 
 * @param {string} data - The markdown data to clean.
 * @returns {string} - The cleaned text data.
 */
const cleanMarkdown = (data) => {
    const match = data.match(/```([\s\S]*?)```/);
    return match ? match[1] : data;
};

export default usePollinationsText;
