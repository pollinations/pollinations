import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom hook to generate text using the Pollinations API.
 *
 * This hook encapsulates the logic for making a POST request to the Pollinations text generation API.
 *
 * @param {string} prompt - The user's input prompt for text generation.
 * @param {Object} options - Configuration options for text generation.
 * @param {number} [options.seed=42] - Seed for deterministic text generation.
 * @param {string} [options.model='openai'] - Model to use for generation.
 * @param {string} [options.systemPrompt] - Optional system prompt to guide the text generation.
 * @param {boolean} [options.jsonMode=false] - Whether to parse the response as JSON.
 * @param {string} [options.apiKey] - Optional API key for authentication.
 * @returns {Object} - { data, isLoading, error }
 */
const usePollinationsText = (prompt, options = {}) => {
    const {
        seed = 42,
        systemPrompt,
        model = "openai",
        jsonMode = false,
        apiKey,
    } = options;

    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);

    const fetchText = useCallback(async () => {
        if (prompt === null) return;

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsLoading(true);
        setError(null);

        try {
            const messages = systemPrompt
                ? [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: prompt },
                  ]
                : [{ role: "user", content: prompt }];

            const headers = { "Content-Type": "application/json" };
            if (apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`;
            }

            const response = await fetch("https://text.pollinations.ai/", {
                method: "POST",
                headers,
                body: JSON.stringify({ messages, seed, model, jsonMode }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            const result = jsonMode ? JSON.parse(text) : text;
            setData(result);
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error("Error in usePollinationsText:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, seed, model, systemPrompt, jsonMode, apiKey]);

    useEffect(() => {
        fetchText();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchText]);

    return { data, isLoading, error };
};

export default usePollinationsText;
