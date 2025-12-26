import { useState, useEffect, useRef } from "react";

const usePollinationsModels = (type = "text", options = {}) => {
    const { apiKey } = options;

    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        const fetchModels = async () => {
            if (apiKey && !/^(pk_|sk_)/.test(apiKey)) {
                console.warn("API key format may be invalid");
            }

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            setIsLoading(true);
            setError(null);

            try {
                const headers = {};
                if (apiKey) {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const endpoint =
                    type === "image"
                        ? "https://gen.pollinations.ai/image/models"
                        : "https://gen.pollinations.ai/text/models";
                const response = await fetch(endpoint, {
                    headers,
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setModels(Array.isArray(data) ? data : []);
                setIsLoading(false);
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("Error fetching models:", err);
                setError(err.message);
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
