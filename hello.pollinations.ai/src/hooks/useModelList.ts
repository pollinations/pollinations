import { useState, useEffect } from "react";
import { API_BASE, getAuthHeaders } from "../api.config";

const IMAGE_MODELS_URL = `${API_BASE}/generate/image/models`;
const TEXT_MODELS_URL = `${API_BASE}/generate/text/models`;

export interface Model {
    id: string;
    name: string;
    type: "image" | "text";
    hasImageInput: boolean;
    hasAudioOutput: boolean;
    hasVideoOutput: boolean;
    inputModalities?: string[];
    outputModalities?: string[];
}

interface UseModelListReturn {
    imageModels: Model[];
    textModels: Model[];
    isLoading: boolean;
    error: any;
    allModels: Model[];
}

/**
 * Custom hook to fetch and manage available models from the API
 * Returns formatted lists of image and text models
 */
export function useModelList(): UseModelListReturn {
    const [imageModels, setImageModels] = useState<Model[]>([]);
    const [textModels, setTextModels] = useState<Model[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const [imageRes, textRes] = await Promise.all([
                    fetch(IMAGE_MODELS_URL, { headers: getAuthHeaders() }),
                    fetch(TEXT_MODELS_URL, { headers: getAuthHeaders() }),
                ]);

                const imageList = await imageRes.json();
                const textList = await textRes.json();

                // Format image models - use modality data from API if available
                const formattedImageModels: Model[] = imageList.map(
                    (m: any) => {
                        const modelId =
                            typeof m === "string" ? m : m.id || m.name;
                        return {
                            id: modelId,
                            name: modelId,
                            type: "image",
                            hasImageInput:
                                m.input_modalities?.includes("image") || false,
                            hasAudioOutput:
                                m.output_modalities?.includes("audio") || false,
                            hasVideoOutput:
                                m.output_modalities?.includes("video") || false,
                            inputModalities: m.input_modalities,
                            outputModalities: m.output_modalities,
                        };
                    },
                );

                // Format text models - use modality data from API if available
                const formattedTextModels: Model[] = textList.map((m: any) => {
                    const modelId = typeof m === "string" ? m : m.id || m.name;
                    return {
                        id: modelId,
                        name: modelId,
                        type: "text",
                        hasImageInput:
                            m.input_modalities?.includes("image") || false,
                        hasAudioOutput:
                            m.output_modalities?.includes("audio") || false,
                        hasVideoOutput:
                            m.output_modalities?.includes("video") || false,
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
