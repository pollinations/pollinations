import {
    getServiceDefinition,
    getVisibleAudioServices,
    getVisibleImageServices,
    getVisibleTextServices,
    type ServiceId,
} from "@shared/registry/registry";
import { useEffect, useState } from "react";
import { API_BASE } from "../api.config";

const IMAGE_MODELS_URL = `${API_BASE}/image/models`;
const TEXT_MODELS_URL = `${API_BASE}/text/models`;
const AUDIO_MODELS_URL = `${API_BASE}/audio/models`;

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
const REGISTRY_IMAGE_MODELS: Model[] = getVisibleImageServices().map((id) =>
    serviceToModel(id, "image"),
);
const REGISTRY_TEXT_MODELS: Model[] = getVisibleTextServices()
    .filter(
        (id) => !getServiceDefinition(id).outputModalities?.includes("audio"),
    )
    .map((id) => serviceToModel(id, "text"));
const REGISTRY_AUDIO_MODELS: Model[] = [
    // Audio models from text services (output_modalities includes "audio")
    ...getVisibleTextServices()
        .filter((id) =>
            getServiceDefinition(id).outputModalities?.includes("audio"),
        )
        .map((id) => serviceToModel(id, "audio")),
    // Dedicated audio services
    ...getVisibleAudioServices().map((id) => serviceToModel(id, "audio")),
];
const ALL_MODELS: Model[] = [
    ...REGISTRY_IMAGE_MODELS,
    ...REGISTRY_TEXT_MODELS,
    ...REGISTRY_AUDIO_MODELS,
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
        const controller = new AbortController();

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
                const signal = controller.signal;

                // Fetch which models are allowed for this key
                const [allowedImageList, allowedTextList, allowedAudioList] =
                    await Promise.all([
                        fetch(IMAGE_MODELS_URL, {
                            headers: authHeaders,
                            signal,
                        })
                            .then((r) => r.json())
                            .catch(() => []),
                        fetch(TEXT_MODELS_URL, {
                            headers: authHeaders,
                            signal,
                        })
                            .then((r) => r.json())
                            .catch(() => []),
                        fetch(AUDIO_MODELS_URL, {
                            headers: authHeaders,
                            signal,
                        })
                            .then((r) => r.json())
                            .catch(() => []),
                    ]);

                if (controller.signal.aborted) return;

                setAllowedImageModelIds(extractIds(allowedImageList || []));

                // openai-audio lives in /text/models but is displayed as audio
                // in the UI — extract it from the text response and merge with
                // the dedicated /audio/models response.
                type RawModel =
                    | {
                          id?: string;
                          name?: string;
                          output_modalities?: string[];
                      }
                    | string;
                const hasAudioOutput = (m: RawModel) =>
                    typeof m !== "string" &&
                    m.output_modalities?.includes("audio");

                const textOnly = (allowedTextList || []).filter(
                    (m: RawModel) => !hasAudioOutput(m),
                );
                const audioFromText = (allowedTextList || []).filter(
                    (m: RawModel) => hasAudioOutput(m),
                );

                setAllowedTextModelIds(extractIds(textOnly));

                const audioIds = extractIds(allowedAudioList || []);
                for (const id of extractIds(audioFromText)) {
                    audioIds.add(id);
                }
                setAllowedAudioModelIds(audioIds);
                setIsLoading(false);
            } catch (err) {
                if (controller.signal.aborted) return;
                console.error("Failed to fetch allowed models:", err);
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            }
        };

        fetchAllowed();

        return () => controller.abort();
    }, [apiKey]);

    return {
        imageModels: REGISTRY_IMAGE_MODELS,
        textModels: REGISTRY_TEXT_MODELS,
        audioModels: REGISTRY_AUDIO_MODELS,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
        isLoading,
        error,
        allModels: ALL_MODELS,
    };
}
