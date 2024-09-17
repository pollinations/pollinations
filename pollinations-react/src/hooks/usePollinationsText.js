import { useState, useEffect } from 'react';
import memoize from 'lodash.memoize';

/**
 * Function to fetch text from the Pollinations API.
 * 
 * @param {Object} requestBody - The request body for the API call.
 * @returns {Promise<string>} - A promise that resolves to the cleaned text data.
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
        return cleanMarkdown(data);
    } catch (error) {
        console.error("Error fetching text from Pollinations API:", error);
        throw error;
    }
};

// Memoized version of fetchPollinationsText
const memoizedFetchPollinationsText = memoize(fetchPollinationsText, JSON.stringify);

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
 * @returns {Object} - An object containing the generated text.
 */
const usePollinationsText = (prompt, options = {}) => {
    // Destructure options with default values
    const { seed = -1, systemPrompt } = options;

    // State to hold the generated text
    const [text, setText] = useState("");

    // Effect to fetch or retrieve memoized text
    useEffect(() => {
        // Calculate an effective seed, either random or user-provided
        const effectiveSeed = seed === -1 ? Math.floor(Math.random() * 20) + 1 : seed;

        // Prepare the request body for the API call
        const messages = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
        messages.push({ role: "user", content: prompt });
        const requestBody = { messages, seed: effectiveSeed };

        memoizedFetchPollinationsText(requestBody)
            .then(cleanedData => {
                setText(cleanedData);
            })
            .catch((error) => {
                console.error("Error in usePollinationsText:", error);
                setText(`An error occurred while generating text: ${error.message}. Please try again.`);
            });
    }, [prompt, systemPrompt, seed]);

    return text;
};

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
