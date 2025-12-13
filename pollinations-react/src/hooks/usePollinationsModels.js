import { useState, useEffect } from "react";

/**
 * Custom hook to fetch available models from the Pollinations API.
 *
 * @param {string} type - The type of models to fetch: "text" or "image"
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.apiKey] - Optional API key for authentication.
 * @returns {Object} - { models, isLoading, error }
 */
const usePollinationsModels = (type = "text", options = {}) => {
    const { apiKey } = options;

    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchModels = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const endpoint =
                    type === "image"
                        ? "https://image.pollinations.ai/models"
                        : "https://text.pollinations.ai/models";

                const headers = {};
                if (apiKey) {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const response = await fetch(endpoint, { headers });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setModels(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Error fetching models:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchModels();
    }, [type, apiKey]);

    return { models, isLoading, error };
};

export default usePollinationsModels;
