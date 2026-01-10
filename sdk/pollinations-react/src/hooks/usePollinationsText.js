import { useState, useEffect, useRef, useCallback } from "react";

const usePollinationsText = (prompt, options = {}) => {
    const {
        seed = 42,
        system,
        model = "openai",
        json = false,
        temperature,
        stream = false,
        private: isPrivate = false,
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
            if (!apiKey) {
                throw new Error("API key is required");
            }

            if (!/^(pk_|sk_)/.test(apiKey)) {
                console.warn("API key format may be invalid");
            }

            const params = new URLSearchParams();
            params.set("seed", seed.toString());
            params.set("model", model);
            if (json) params.set("json", "true");
            if (system) params.set("system", system);
            if (temperature !== undefined) params.set("temperature", temperature.toString());
            if (stream) params.set("stream", "true");
            if (isPrivate) params.set("private", "true");

            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            };

            const response = await fetch(
                `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?${params.toString()}`,
                {
                    headers,
                    signal: abortControllerRef.current.signal,
                },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            let result = text;
            if (json) {
                try {
                    result = JSON.parse(text);
                } catch (parseErr) {
                    throw new Error(
                        `Failed to parse JSON response: ${parseErr.message}`,
                    );
                }
            }
            setData(result);
            setIsLoading(false);
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error("Error in usePollinationsText:", err);
            setError(err.message);
            setIsLoading(false);
        }
    }, [prompt, seed, model, system, json, temperature, stream, isPrivate, apiKey]);

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
