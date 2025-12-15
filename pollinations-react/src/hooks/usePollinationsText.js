import { useState, useEffect, useRef, useCallback } from "react";

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
        if (!prompt || prompt.trim() === "") return;

        if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
            setError("Seed must be a 32-bit unsigned integer (0-4294967295)");
            return;
        }


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
            
            if (!apiKey) {
                throw new Error("API key is required");
            }

            if (!/^(pk_|sk_)/.test(apiKey)) {
                console.warn("API key format may be invalid");
            }

            headers["Authorization"] = `Bearer ${apiKey}`;

            const response = await fetch("https://enter.pollinations.ai/api/generate/openai", {
                method: "POST",
                headers,
                body: JSON.stringify({ messages, seed, model, jsonMode }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            let result = text;
            if (jsonMode) {
                try {
                    result = JSON.parse(text);
                } catch (parseErr) {
                    throw new Error(`Failed to parse JSON response: ${parseErr.message}`);
                }
            }
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