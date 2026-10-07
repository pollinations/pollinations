import { useCallback, useMemo, useState } from "react";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";

const IMAGE_MODELS_URL = `${API_BASE}/image/models`;
const TEXT_MODELS_URL = `${API_BASE}/text/models`;
const AUDIO_MODELS_URL = `${API_BASE}/audio/models`;

export interface Model {
    id: string;
    name: string;
    aliases?: string[];
    title: string;
    description?: string;
    type: "image" | "text" | "audio";
    hasImageInput: boolean;
    hasAudioOutput: boolean;
    hasVideoOutput: boolean;
    inputModalities?: string[];
    outputModalities?: string[];
    supportedEndpoints?: string[];
    voices?: string[];
    paid_only?: boolean;
    community?: boolean;
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

const CACHE_KEY_PREFIX = "pollinations:modelList:v3:";
const TTL_MS = 5 * 60 * 1000; // 5 minutes

type RawModel =
    | {
          id?: string;
          name?: string;
          aliases?: string[];
          title?: string;
          description?: string;
          input_modalities?: string[];
          output_modalities?: string[];
          supported_endpoints?: string[];
          voices?: string[];
          paid_only?: boolean;
          community?: boolean;
      }
    | string;

interface AllowedModelsData {
    image: string[];
    text: string[];
    audio: string[];
}

interface ModelListData {
    imageModels: Model[];
    textModels: Model[];
    audioModels: Model[];
    allowed: AllowedModelsData;
}

function extractIds(
    list: Array<{ id?: string; name?: string } | string>,
): string[] {
    return list.map((m) => (typeof m === "string" ? m : m.id || m.name || ""));
}

function hasAudioOutput(m: RawModel): boolean {
    return typeof m !== "string" && !!m.output_modalities?.includes("audio");
}

export type AudioGenerationEndpoint =
    | "/v1/audio/speech"
    | "/v1/chat/completions";

export function getAudioGenerationEndpoint(
    model:
        | {
              inputModalities?: readonly string[];
              outputModalities?: readonly string[];
              supportedEndpoints?: readonly string[];
          }
        | undefined,
): AudioGenerationEndpoint | undefined {
    if (
        !model?.inputModalities?.includes("text") ||
        !model.outputModalities?.includes("audio")
    ) {
        return undefined;
    }

    if (model.supportedEndpoints?.includes("/v1/audio/speech")) {
        return "/v1/audio/speech";
    }
    if (model.supportedEndpoints?.includes("/v1/chat/completions")) {
        return "/v1/chat/completions";
    }
    return undefined;
}

export function sendAudioGenerationRequest(
    currentModel: Model,
    selectedModel: string,
    prompt: string,
    voice: string,
    apiKey: string,
): Promise<Response> {
    const endpoint = getAudioGenerationEndpoint(currentModel);
    if (!endpoint) {
        throw new Error(
            `Model "${currentModel.id}" has no supported audio endpoint`,
        );
    }

    const body =
        endpoint === "/v1/audio/speech"
            ? {
                  model: selectedModel,
                  input: prompt,
                  ...(voice ? { voice } : {}),
              }
            : {
                  model: selectedModel,
                  modalities: ["text", "audio"],
                  audio: { voice: voice || "alloy", format: "wav" },
                  messages: [{ role: "user", content: prompt }],
              };

    return fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
}

function audioGenerationEndpoint(model: RawModel) {
    if (typeof model === "string") return undefined;
    return getAudioGenerationEndpoint({
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        supportedEndpoints: model.supported_endpoints,
    });
}

function modelId(model: RawModel): string {
    return typeof model === "string" ? model : model.id || model.name || "";
}

function apiModelToModel(model: RawModel, type: Model["type"]): Model | null {
    const id = modelId(model);
    if (!id) return null;

    if (typeof model === "string") {
        return {
            id,
            name: id,
            title: id,
            type,
            hasImageInput: false,
            hasAudioOutput: false,
            hasVideoOutput: false,
        };
    }

    return {
        id,
        name: id,
        title: model.title || model.description?.split(" - ")[0]?.trim() || id,
        description: model.description,
        aliases: model.aliases,
        type,
        hasImageInput: model.input_modalities?.includes("image") || false,
        hasAudioOutput: model.output_modalities?.includes("audio") || false,
        hasVideoOutput: model.output_modalities?.includes("video") || false,
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        supportedEndpoints: model.supported_endpoints,
        voices: model.voices,
        paid_only: model.paid_only,
        community: model.community === true,
    };
}

async function fetchJson(url: string, headers?: Record<string, string>) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }
    return (await response.json()) as RawModel[];
}

export async function fetchCatalogModels(): Promise<{
    imageModels: Model[];
    textModels: Model[];
    audioModels: Model[];
}> {
    const [imageList, textList, audioList] = await Promise.all([
        fetchJson(IMAGE_MODELS_URL),
        fetchJson(TEXT_MODELS_URL),
        fetchJson(AUDIO_MODELS_URL),
    ]);

    const imageModels = imageList
        .map((model) => apiModelToModel(model, "image"))
        .filter((model): model is Model => Boolean(model));
    const textModels = textList
        .filter((model) => !hasAudioOutput(model))
        .map((model) => apiModelToModel(model, "text"))
        .filter((model): model is Model => Boolean(model));
    const audioModels = [
        ...textList
            .filter((model) => audioGenerationEndpoint(model))
            .map((model) => apiModelToModel(model, "audio")),
        ...audioList
            .filter((model) => audioGenerationEndpoint(model))
            .map((model) => apiModelToModel(model, "audio")),
    ].filter((model): model is Model => Boolean(model));

    return { imageModels, textModels, audioModels };
}

const EMPTY_ALLOWED: AllowedModelsData = { image: [], text: [], audio: [] };

async function fetchAllowedModels(
    apiKey: string | null,
): Promise<AllowedModelsData> {
    // Logged-out users have no allowed models — everything shows grayed out.
    if (!apiKey) return EMPTY_ALLOWED;

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

async function fetchModelListData(
    apiKey: string | null,
): Promise<ModelListData> {
    const [catalog, allowed] = await Promise.all([
        fetchCatalogModels(),
        fetchAllowedModels(apiKey),
    ]);

    return {
        ...catalog,
        allowed,
    };
}

/**
 * Custom hook to fetch and manage available models from the API
 * Full model list comes from the public model endpoints.
 * @param apiKey - API key from useAuth (null when logged out → all models grayed out)
 */
export function useModelList(apiKey: string | null): UseModelListReturn {
    const [error, setError] = useState<Error | null>(null);

    const fetcher = useCallback(
        () =>
            fetchModelListData(apiKey).catch((err) => {
                setError(err instanceof Error ? err : new Error(String(err)));
                throw err;
            }),
        [apiKey],
    );

    const cacheKey = `${CACHE_KEY_PREFIX}${apiKey ? apiKey.slice(-8) : "anon"}`;
    const { data, loading: isLoading } = useCachedFetch<ModelListData>(
        cacheKey,
        fetcher,
        TTL_MS,
    );

    const allowedImageModelIds = useMemo(
        () => new Set<string>(data?.allowed.image ?? []),
        [data],
    );
    const allowedTextModelIds = useMemo(
        () => new Set<string>(data?.allowed.text ?? []),
        [data],
    );
    const allowedAudioModelIds = useMemo(
        () => new Set<string>(data?.allowed.audio ?? []),
        [data],
    );

    const imageModels = data?.imageModels ?? [];
    const textModels = data?.textModels ?? [];
    const audioModels = data?.audioModels ?? [];

    return {
        imageModels,
        textModels,
        audioModels,
        allowedImageModelIds,
        allowedTextModelIds,
        allowedAudioModelIds,
        isLoading,
        error,
        allModels: [...imageModels, ...textModels, ...audioModels],
    };
}
