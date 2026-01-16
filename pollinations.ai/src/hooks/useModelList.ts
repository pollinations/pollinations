import { useState, useEffect } from "react";
import { API_BASE } from "../api.config";

const IMAGE_MODELS_URL = `${API_BASE}/image/models`;
const TEXT_MODELS_URL = `${API_BASE}/text/models`;

export interface Model {
    id: string;
    name: string;
    description?: string;
    type: "image" | "text";
    hasImageInput: boolean;
    hasAudioOutput: boolean;
    hasVideoOutput: boolean;
    inputModalities?: string[];
    outputModalities?: string[];
    voices?: string[];
}

interface UseModelListReturn {
    imageModels: Model[];
    textModels: Model[];
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    isLoading: boolean;
    error: Error | null;
    allModels: Model[];
}

// Helper to format model response (outside hook to avoid dependency issues)
const formatModels = (
    list: Array<
        | {
              id?: string;
              name?: string;
              description?: string;
              input_modalities?: string[];
              output_modalities?: string[];
              voices?: string[];
          }
        | string
    >,
    type: "image" | "text",
): Model[] => {
    return list.map((m) => {
        const modelId = typeof m === "string" ? m : m.id || m.name || "";
        const obj = typeof m === "string" ? {} : m;
        return {
            id: modelId,
            name: modelId,
            description: obj.description,
            type,
            hasImageInput: obj.input_modalities?.includes("image") || false,
            hasAudioOutput: obj.output_modalities?.includes("audio") || false,
            hasVideoOutput: obj.output_modalities?.includes("video") || false,
            inputModalities: obj.input_modalities,
            outputModalities: obj.output_modalities,
            voices: obj.voices,
        };
    });
};

/**
 * Custom hook to fetch and manage available models from the API
 * Returns formatted lists of image and text models
 * @param apiKey - API key to use for authentication (from useAuth hook)
 */
export function useModelList(apiKey: string): UseModelListReturn {
    const [imageModels, setImageModels] = useState<Model[]>([]);
    const [textModels, setTextModels] = useState<Model[]>([]);
    const [allowedImageModelIds, setAllowedImageModelIds] = useState<
        Set<string>
    >(new Set());
    const [allowedTextModelIds, setAllowedTextModelIds] = useState<Set<string>>(
        new Set(),
    );
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                // Fetch ALL models (no auth) to show complete list
                const [allImageRes, allTextRes] = await Promise.all([
                    fetch(IMAGE_MODELS_URL),
                    fetch(TEXT_MODELS_URL),
                ]);

                const allImageList = await allImageRes.json();
                const allTextList = await allTextRes.json();

                setImageModels(formatModels(allImageList, "image"));
                setTextModels(formatModels(allTextList, "text"));

                // Fetch ALLOWED models (with API key) to know which are enabled
                const [allowedImageRes, allowedTextRes] = await Promise.all([
                    fetch(IMAGE_MODELS_URL, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    }),
                    fetch(TEXT_MODELS_URL, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    }),
                ]);

                const allowedImageList = await allowedImageRes.json();
                const allowedTextList = await allowedTextRes.json();

                // Extract IDs of allowed models
                const allowedImageIds = new Set<string>(
                    allowedImageList.map(
                        (m: { id?: string; name?: string } | string) =>
                            typeof m === "string" ? m : m.id || m.name || "",
                    ),
                );
                const allowedTextIds = new Set<string>(
                    allowedTextList.map(
                        (m: { id?: string; name?: string } | string) =>
                            typeof m === "string" ? m : m.id || m.name || "",
                    ),
                );

                setAllowedImageModelIds(allowedImageIds);
                setAllowedTextModelIds(allowedTextIds);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to fetch models:", err);
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            }
        };

        fetchModels();
    }, [apiKey]);

    return {
        imageModels,
        textModels,
        allowedImageModelIds,
        allowedTextModelIds,
        isLoading,
        error,
        allModels: [...imageModels, ...textModels],
    };
}
