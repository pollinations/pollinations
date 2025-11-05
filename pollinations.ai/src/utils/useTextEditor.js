import { useState, useEffect, useRef, useCallback } from "react";
import { PLAYGROUND_API_KEY, ENTER_BASE_URL } from "./enterApi";

/**
 * Hook for text editor functionality
 */
export const useTextEditor = ({ stop, entry }) => {
    const [currentEntry, setCurrentEntry] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const hasGeneratedEntry = useRef(false);

    // Update from parent entry if needed
    useEffect(() => {
        if (!entry) return;

        // Always update currentEntry when the parent entry changes
        setCurrentEntry(entry);
    }, [entry]);

    // Generate text via API (using POST with OpenAI format)
    const updateText = useCallback(
        async (parameters) => {
            // Skip if no parameters or already loading
            if (!parameters || isLoading) return;

            console.log("updateText called with parameters:", parameters);

            setIsLoading(true);

            // Stop the feed while generating
            if (stop) stop(true);

            try {
                const url = `${ENTER_BASE_URL}/generate/openai`;

                const body = {
                    model: parameters.model || "openai",
                    messages: parameters.messages || [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: "" }
                    ],
                    temperature: parameters.temperature || 0.7,
                    max_tokens: parameters.max_tokens || 1000,
                };

                console.log("Fetching from URL:", url);
                console.log("Request body:", body);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${PLAYGROUND_API_KEY}`,
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `HTTP error! status: ${response.status}, message: ${errorText || "No error details"}`,
                    );
                }

                const data = await response.json();
                const responseText = data.choices?.[0]?.message?.content || "";

                const newEntry = {
                    response: responseText,
                    referrer: "pollinations.ai",
                    parameters: {
                        ...parameters,
                        type: "chat",
                        method: "POST",
                    },
                };

                hasGeneratedEntry.current = true;
                setCurrentEntry(newEntry);
            } catch (error) {
                console.warn("Error generating text:", error.message);

                const errorEntry = {
                    response: `Error: ${error.message}. Please try again.`,
                    referrer: "pollinations.ai",
                    parameters: {
                        ...parameters,
                        type: "chat",
                        method: "POST",
                        error: error.message,
                    },
                };

                hasGeneratedEntry.current = true;
                setCurrentEntry(errorEntry);
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, stop],
    );

    // Cancel generation
    const cancelGeneration = useCallback(() => {
        setIsLoading(false);
    }, []);

    return {
        updateText,
        cancelGeneration,
        isLoading,
        entry: currentEntry,
    };
};
