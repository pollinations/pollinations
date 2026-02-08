import {
    getAudioServices,
    getImageServices,
    getServiceDefinition,
    getTextServices,
    type ServiceId,
} from "@shared/registry/registry";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../api.config";

const IMAGE_MODELS_URL = `${API_BASE}/image/models`;
const TEXT_MODELS_URL = `${API_BASE}/text/models`;

export interface Model {
    id: string;
    name: string;
    description?: string;
    type: "image" | "text" | "audio";
    hasImageInput: boolean;
    hasAudioOutput: boolean;
    hasVideoOutput: boolean;
    inputModalities?: string[];
    outputModalities?: string[];
    voices?: string[];
    paid_only?: boolean;
}

interface UseModelListReturn {
    imageModels: Model[];
    textModels: Model[];
    audioModels: Model[];
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
    isLoading: boolean;
    error: Error | null;
    allModels: Model[];
}

// Convert a registry service to a Model
function serviceToModel(
    serviceId: ServiceId,
    type: "image" | "text" | "audio",
): Model {
    const def = getServiceDefinition(serviceId);
    return {
        id: serviceId as string,
        name: serviceId as string,
        description: def.description,
        type,
        hasImageInput: def.inputModalities?.includes("image") || false,
        hasAudioOutput: def.outputModalities?.includes("audio") || false,
        hasVideoOutput: def.outputModalities?.includes("video") || false,
        inputModalities: def.inputModalities,
        outputModalities: def.outputModalities,
        voices: def.voices,
        paid_only: def.paidOnly,
    };
}

// Build the full model lists from the shared registry (instant, no fetch)
const REGISTRY_IMAGE_MODELS: Model[] = getImageServices().map((id) =>
    serviceToModel(id, "image"),
);
const REGISTRY_TEXT_MODELS: Model[] = getTextServices()
    .filter((id) => {
        const def = getServiceDefinition(id);
        return !def.outputModalities?.includes("audio");
    })
    .map((id) => serviceToModel(id, "text"));
const REGISTRY_AUDIO_MODELS: Model[] = [
    // Audio models from text services (output_modalities includes "audio")
    ...getTextServices()
        .filter((id) => {
            const def = getServiceDefinition(id);
            return def.outputModalities?.includes("audio");
        })
        .map((id) => serviceToModel(id, "audio")),
    // Dedicated audio services
    ...getAudioServices().map((id) => serviceToModel(id, "audio")),
];

/**
 * Custom hook to fetch and manage available models from the API
 * Full model list comes from the shared registry (instant).
 * Only fetches API to determine which models are allowed for the current key.
 * @param apiKey - API key to use for authentication (from useAuth hook)
 */
export function useModelList(apiKey: string): UseModelListReturn {
    const [allowedImageModelIds, setAllowedImageModelIds] = useState<
        Set<string>
    >(new Set());
    const [allowedTextModelIds, setAllowedTextModelIds] = useState<Set<string>>(
        new Set(),
    );
    const [allowedAudioModelIds, setAllowedAudioModelIds] = useState<
        Set<string>
    >(new Set());
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const extractIds = (
            list: Array<{ id?: string; name?: string } | string>,
        ) =>
            new Set<string>(
                list.map((m) =>
                    typeof m === "string" ? m : m.id || m.name || "",
                ),
            );

        const fetchAllowed = async () => {
            try {
                const authHeaders = {
                    Authorization: `Bearer ${apiKey}`,
                };

                // Only fetch which models are allowed for this key
                const [allowedImageList, allowedTextList] = await Promise.all([
                    fetch(IMAGE_MODELS_URL, { headers: authHeaders })
                        .then((r) => r.json())
                        .catch(() => []),
                    fetch(TEXT_MODELS_URL, { headers: authHeaders })
                        .then((r) => r.json())
                        .catch(() => []),
                ]);

                // Image endpoint returns image + video models
                setAllowedImageModelIds(extractIds(allowedImageList || []));

                // Text endpoint returns text + audio models — split them
                type RawModel =
                    | {
                          id?: string;
                          name?: string;
                          output_modalities?: string[];
                      }
                    | string;
                const isAudio = (m: RawModel) =>
                    typeof m !== "string" &&
                    m.output_modalities?.includes("audio");

                const textOnly = (allowedTextList || []).filter(
                    (m: RawModel) => !isAudio(m),
                );
                const audioOnly = (allowedTextList || []).filter(
                    (m: RawModel) => isAudio(m),
                );

                setAllowedTextModelIds(extractIds(textOnly));

                // Dedicated audio services (elevenlabs, etc.) aren't returned by
                // /text/models or /image/models. Include them based on paid_only:
                // free models are always allowed, paid models need a logged-in user.
                const audioIds = extractIds(audioOnly);
                for (const model of REGISTRY_AUDIO_MODELS) {
                    if (!audioIds.has(model.id) && !model.paid_only) {
                        audioIds.add(model.id);
                    }
                }
                setAllowedAudioModelIds(audioIds);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to fetch allowed models:", err);
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            }
        };

        fetchAllowed();
    }, [apiKey]);

    const allModels = useMemo(
        () => [
            ...REGISTRY_IMAGE_MODELS,
            ...REGISTRY_TEXT_MODELS,
            ...REGISTRY_AUDIO_MODELS,
        ],
        [],
    );

    return {
        imageModels: REGISTRY_IMAGE_MODELS,
        textModels: REGISTRY_TEXT_MODELS,
        audioModels: REGISTRY_AUDIO_MODELS,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
        isLoading,
        error,
        allModels,
    };
}
