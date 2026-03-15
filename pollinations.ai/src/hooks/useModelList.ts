import {
    getServiceDefinition,
    getVisibleAudioServices,
    getVisibleImageServices,
    getVisibleTextServices,
    type ServiceId,
} from "@shared/registry/registry";
import { useCallback, useMemo, useState } from "react";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";

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

const CACHE_KEY_PREFIX = "pollinations:allowedModels:";
const TTL_MS = 5 * 60 * 1000; // 5 minutes

type RawModel =
    | { id?: string; name?: string; output_modalities?: string[] }
    | string;

interface AllowedModelsData {
    image: string[];
    text: string[];
    audio: string[];
}

function extractIds(
    list: Array<{ id?: string; name?: string } | string>,
): string[] {
    return list.map((m) => (typeof m === "string" ? m : m.id || m.name || ""));
}

function hasAudioOutput(m: RawModel): boolean {
    return typeof m !== "string" && !!m.output_modalities?.includes("audio");
}

async function fetchAllowedModels(apiKey: string): Promise<AllowedModelsData> {
    const authHeaders = { Authorization: `Bearer ${apiKey}` };

    const [allowedImageList, allowedTextList, allowedAudioList] =
        await Promise.all([
            fetch(IMAGE_MODELS_URL, { headers: authHeaders })
                .then((r) => r.json())
                .catch(() => []),
            fetch(TEXT_MODELS_URL, { headers: authHeaders })
                .then((r) => r.json())
                .catch(() => []),
            fetch(AUDIO_MODELS_URL, { headers: authHeaders })
                .then((r) => r.json())
                .catch(() => []),
        ]);

    const textOnly = (allowedTextList || []).filter(
        (m: RawModel) => !hasAudioOutput(m),
    );
    const audioFromText = (allowedTextList || []).filter((m: RawModel) =>
        hasAudioOutput(m),
    );

    const audioIds = extractIds(allowedAudioList || []);
    for (const id of extractIds(audioFromText)) {
        audioIds.push(id);
    }

    return {
        image: extractIds(allowedImageList || []),
        text: extractIds(textOnly),
        audio: audioIds,
    };
}

/**
 * Custom hook to fetch and manage available models from the API
 * Full model list comes from the shared registry (instant).
 * Only fetches API to determine which models are allowed for the current key.
 * @param apiKey - API key to use for authentication (from useAuth hook)
 */
export function useModelList(apiKey: string): UseModelListReturn {
    const [error, setError] = useState<Error | null>(null);

    const fetcher = useCallback(
        () =>
            fetchAllowedModels(apiKey).catch((err) => {
                setError(err instanceof Error ? err : new Error(String(err)));
                throw err;
            }),
        [apiKey],
    );

    const cacheKey = `${CACHE_KEY_PREFIX}${apiKey ? apiKey.slice(-8) : "anon"}`;
    const { data, loading: isLoading } = useCachedFetch<AllowedModelsData>(
        cacheKey,
        fetcher,
        TTL_MS,
    );

    const allowedImageModelIds = useMemo(
        () => new Set<string>(data?.image ?? []),
        [data],
    );
    const allowedTextModelIds = useMemo(
        () => new Set<string>(data?.text ?? []),
        [data],
    );
    const allowedAudioModelIds = useMemo(
        () => new Set<string>(data?.audio ?? []),
        [data],
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
        allModels: ALL_MODELS,
    };
}
