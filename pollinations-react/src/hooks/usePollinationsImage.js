import { useState, useEffect, useRef, useCallback } from "react";

const usePollinationsImage = (prompt, options = {}) => {
    const {
        width = 1024,
        height = 1024,
        model = "flux",
        seed = 42,
        nologo = true,
        enhance = false,
        apiKey,
    } = options;

    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);

    const fetchImage = useCallback(async () => {
        if (!prompt) return;

        if (width < 64 || width > 2048 || height < 64 || height > 2048) {
            setError("Width and height must be between 64 and 2048");
            return;
        }

        if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
            setError("Seed must be a 32-bit unsigned integer (0-4294967295)");
            return;
        }


        if (!apiKey) {
            setError("API key is required");
            return;
        }

        if (!/^(pk_|sk_)/.test(apiKey)) {
            console.warn("API key format may be invalid");
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set("width", width.toString());
            params.set("height", height.toString());
            params.set("seed", seed.toString());
            params.set("model", model);
            if (nologo) params.set("nologo", "true");
            if (enhance) params.set("enhance", "true");

            const headers = {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            };

            const response = await fetch(
                `https://enter.pollinations.ai/api/generate/image/${encodeURIComponent(prompt)}?${params.toString()}`,
                { headers, signal: abortControllerRef.current.signal }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const imageData = await response.text();
            setData(imageData);
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error("Error in usePollinationsImage:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, width, height, model, seed, nologo, enhance, apiKey]);

    useEffect(() => {
        fetchImage();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchImage]);

    return { data, isLoading, error };
};

export default usePollinationsImage;