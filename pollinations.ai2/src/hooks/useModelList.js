import { useState, useEffect } from "react";

const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

/**
 * Custom hook to fetch and manage available models from the API
 * Returns formatted lists of image and text models
 */
export function useModelList() {
    const [imageModels, setImageModels] = useState([]);
    const [textModels, setTextModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const [imageRes, textRes] = await Promise.all([
                    fetch(
                        "https://enter.pollinations.ai/api/generate/image/models",
                        {
                            headers: { Authorization: `Bearer ${API_KEY}` },
                        },
                    ),
                    fetch(
                        "https://enter.pollinations.ai/api/generate/text/models",
                        {
                            headers: { Authorization: `Bearer ${API_KEY}` },
                        },
                    ),
                ]);

                const imageList = await imageRes.json();
                const textList = await textRes.json();

                // TODO: In the future, use /v1/models endpoint which returns:
                // { name, input_modalities: ["text", "image"], output_modalities: ["text"], ... }
                // Then check: model.input_modalities?.includes("image")

                // Hardcoded models with image input modality for now
                const imageInputModels = [
                    "kontext",
                    "seedream",
                    "nanobanana",
                    "gptimage",
                ];

                // Format image models - handle both string and object formats
                const formattedImageModels = imageList.map((m) => {
                    const modelId = typeof m === "string" ? m : m.id || m.name;
                    return {
                        id: modelId,
                        name:
                            modelId.charAt(0).toUpperCase() + modelId.slice(1),
                        type: "image",
                        hasImageInput: imageInputModels.includes(modelId),
                    };
                });

                // Format text models - handle both string and object formats
                const formattedTextModels = textList.map((m) => {
                    const modelId = typeof m === "string" ? m : m.id || m.name;
                    return {
                        id: modelId,
                        name:
                            modelId.charAt(0).toUpperCase() + modelId.slice(1),
                        type: "text",
                        hasImageInput: false, // Text models don't have image input yet
                    };
                });

                setImageModels(formattedImageModels);
                setTextModels(formattedTextModels);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to fetch models:", err);
                setError(err);
                setIsLoading(false);
            }
        };

        fetchModels();
    }, []);

    return {
        imageModels,
        textModels,
        isLoading,
        error,
        allModels: [...imageModels, ...textModels],
    };
}
