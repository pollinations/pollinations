import { useState, useEffect } from "react";
import { API_KEY } from "../config/api";

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

                // Format image models - use modality data from API if available
                const formattedImageModels = imageList.map((m) => {
                    const modelId = typeof m === "string" ? m : m.id || m.name;
                    return {
                        id: modelId,
                        name: modelId,
                        type: "image",
                        hasImageInput:
                            m.input_modalities?.includes("image") || false,
                        hasAudioOutput:
                            m.output_modalities?.includes("audio") || false,
                        inputModalities: m.input_modalities,
                        outputModalities: m.output_modalities,
                    };
                });

                // Format text models - use modality data from API if available
                const formattedTextModels = textList.map((m) => {
                    const modelId = typeof m === "string" ? m : m.id || m.name;
                    return {
                        id: modelId,
                        name: modelId,
                        type: "text",
                        hasImageInput:
                            m.input_modalities?.includes("image") || false,
                        hasAudioOutput:
                            m.output_modalities?.includes("audio") || false,
                        inputModalities: m.input_modalities,
                        outputModalities: m.output_modalities,
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
