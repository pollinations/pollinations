import { useState, useEffect } from "react";

/**
 * Hook to fetch available models from the Pollinations API
 * Supports both text and image model types
 * @param {string} modelType - 'text' or 'image'
 * @returns {Object} - loading, error, and models data
 */
export const useModels = (modelType = "text") => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                setLoading(true);
                const endpoint =
                    modelType === "text"
                        ? "https://text.pollinations.ai/models"
                        : "https://image.pollinations.ai/models";

                const response = await fetch(endpoint);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (modelType === "text") {
                    // Process text models
                    let processedModels = [];

                    if (Array.isArray(data)) {
                        // Process all models
                        processedModels = data.map((model) => ({
                            id: model.name,
                            name: model.description
                                ? `${model.name} - ${model.description}`
                                : model.name,
                            details: model,
                        }));
                    }

                    // Sort models alphabetically
                    processedModels.sort((a, b) =>
                        a.name.localeCompare(b.name),
                    );

                    setModels(processedModels);
                } else {
                    // Process image models
                    if (Array.isArray(data)) {
                        const imageModels = data.map((modelId) => ({
                            id: modelId,
                            name: modelId,
                        }));
                        setModels(imageModels);
                    } else {
                        console.warn(
                            "Unexpected image model data format:",
                            data,
                        );
                        throw new Error("Unexpected image model data format");
                    }
                }

                setError(null);
            } catch (err) {
                console.error(`Error fetching ${modelType} models:`, err);
                setError(err.message);
                setModels([]);
            } finally {
                setLoading(false);
            }
        };

        fetchModels();
    }, [modelType]);

    return { models, loading, error };
};
