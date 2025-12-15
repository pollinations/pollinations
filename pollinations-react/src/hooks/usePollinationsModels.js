import { useState, useEffect, useRef } from "react";

const usePollinationsModels = (type = "text", options = {}) => {
    const { apiKey } = options;

    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        const fetchModels = async () => {
            if (!apiKey) {
                setError("API key is required");
                setIsLoading(false);
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
                const headers = {
                    "Authorization": `Bearer ${apiKey}`,
                };

                const response = await fetch(
                    "https://enter.pollinations.ai/api/models",
                    { headers, signal: abortControllerRef.current.signal }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setModels(Array.isArray(data) ? data : []);
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("Error fetching models:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchModels();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [type, apiKey]);

    return { models, isLoading, error };
};

export default usePollinationsModels;
