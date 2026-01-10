import { useState, useEffect, useRef, useCallback } from "react";

const usePollinationsVideo = (prompt, options = {}) => {
    const {
        model = "veo",
        duration = 4,
        aspectRatio = "16:9",
        seed = 42,
        audio = false,
        nologo = true,
        safe = false,
        apiKey,
    } = options;

    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);
    const blobUrlRef = useRef(null);

    const validateParams = useCallback(() => {
        const validModels = ["veo", "seedance", "seedance-pro"];
        if (!validModels.includes(model)) {
            return `Invalid model. Supported models: ${validModels.join(", ")}`;
        }

        if (typeof duration !== "number" || duration < 1 || duration > 10) {
            return "Duration must be an integer between 1 and 10 seconds";
        }

        if (model === "veo") {
            if (![4, 6, 8].includes(duration)) {
                return "For 'veo' model, duration must be 4, 6, or 8 seconds";
            }
        } else if (model === "seedance" || model === "seedance-pro") {
            if (duration < 2 || duration > 10) {
                return `For '${model}' model, duration must be between 2 and 10 seconds`;
            }
        }

        const validAspectRatios = ["16:9", "9:16"];
        if (!validAspectRatios.includes(aspectRatio)) {
            return `Invalid aspect ratio. Supported: ${validAspectRatios.join(", ")}`;
        }

        return null;
    }, [model, duration, aspectRatio]);

    const fetchVideo = useCallback(async () => {
        if (!prompt) return;

        const paramsError = validateParams();
        if (paramsError) {
            setError(paramsError);
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
            params.set("model", model);
            params.set("duration", duration.toString());
            params.set("aspectRatio", aspectRatio);
            params.set("seed", seed.toString());
            if (audio && model === "veo") params.set("audio", "true");
            if (nologo) params.set("nologo", "true");
            if (safe) params.set("safe", "true");

            const headers = {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            };

            const response = await fetch(
                `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${params.toString()}`,
                { headers, signal: abortControllerRef.current.signal },
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            const blob = await response.blob();
            const videoUrl = URL.createObjectURL(blob);
            blobUrlRef.current = videoUrl;
            setData(videoUrl);
            setIsLoading(false);
        } catch (err) {
            if (err.name === "AbortError") return;
            console.error("Error in usePollinationsVideo:", err);
            setError(err.message);
            setIsLoading(false);
        }
    }, [prompt, model, duration, aspectRatio, seed, audio, nologo, safe, apiKey, validateParams]);

    useEffect(() => {
        fetchVideo();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
        };
    }, [fetchVideo]);

    return { data, isLoading, error };
};

export default usePollinationsVideo;
