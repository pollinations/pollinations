import type { ModelCategory, ModelInfo, RequestOptions } from "./types.js";
import { PollinationsError } from "./types.js";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

export type ModelCatalogCategory = ModelCategory;

export interface ModelCatalogItem extends Omit<ModelInfo, "id" | "category"> {
    id: string;
    category: ModelCatalogCategory;
}

export interface ModelCatalog {
    models: ModelCatalogItem[];
    allowedModelIds: Set<string>;
    allowedImageModelIds: Set<string>;
    allowedVideoModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
    allowedEmbeddingModelIds: Set<string>;
    allowedRealtimeModelIds: Set<string>;
}

export interface FetchModelCatalogOptions extends RequestOptions {
    apiKey?: string | null;
    baseUrl?: string;
}

type RawModelInfo = ModelInfo;
type ModelListResponse = {
    data?: (ModelInfo & { id?: string; supported_endpoints?: string[] })[];
};

function modelId(model: RawModelInfo): string {
    return model.id || model.name;
}

function isModelCatalogCategory(value: unknown): value is ModelCatalogCategory {
    return (
        value === "image" ||
        value === "video" ||
        value === "text" ||
        value === "audio" ||
        value === "embedding" ||
        value === "realtime"
    );
}

function legacyCategoryFor(model: RawModelInfo): ModelCatalogCategory | null {
    const output = model.output_modalities ?? [];
    const supportedEndpoints = model.supported_endpoints ?? [];

    if (supportedEndpoints.includes("/v1/realtime")) return "realtime";
    if (supportedEndpoints.includes("/v1/embeddings")) return "embedding";
    if (output.includes("embedding")) return "embedding";
    if (output.includes("video")) return "video";
    if (output.includes("image")) return "image";
    if (output.includes("audio")) return "audio";
    if (output.includes("text")) return "text";
    return null;
}

function categoryFor(model: RawModelInfo): ModelCatalogCategory | null {
    if (isModelCatalogCategory(model.category)) return model.category;
    return legacyCategoryFor(model);
}

function normalizeModel(model: RawModelInfo): ModelCatalogItem | null {
    const id = modelId(model);
    const category = categoryFor(model);
    if (!id || !category) return null;

    return {
        ...model,
        id,
        name: model.name || id,
        category,
    };
}

function sortModels(models: ModelCatalogItem[]): ModelCatalogItem[] {
    const order: Record<ModelCatalogCategory, number> = {
        image: 0,
        video: 1,
        text: 2,
        audio: 3,
        embedding: 4,
        realtime: 5,
    };

    return [...models].sort((a, b) => {
        const categoryDelta = order[a.category] - order[b.category];
        if (categoryDelta !== 0) return categoryDelta;
        return a.id.localeCompare(b.id);
    });
}

async function fetchJson(
    baseUrl: string,
    path: string,
    apiKey: string | null | undefined,
    signal?: AbortSignal,
): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(`${baseUrl}${path}`, {
        headers,
        signal,
    });

    if (!response.ok) {
        throw new PollinationsError(
            `Failed to fetch model catalog from ${path}`,
            "MODEL_CATALOG",
            response.status,
        );
    }

    return response.json();
}

async function fetchCompatibleModelList(
    baseUrl: string,
    apiKey: string | null | undefined,
    signal?: AbortSignal,
): Promise<ModelListResponse> {
    try {
        return (await fetchJson(
            baseUrl,
            "/v1/models",
            apiKey,
            signal,
        )) as ModelListResponse;
    } catch (error) {
        if (signal?.aborted) throw error;
        return { data: [] };
    }
}

function idsForCategory(
    models: ModelCatalogItem[],
    category: ModelCatalogCategory,
): Set<string> {
    return new Set(
        models
            .filter((model) => model.category === category)
            .map((model) => model.id),
    );
}

async function fetchCatalogModels(
    baseUrl: string,
    apiKey: string | null | undefined,
    signal?: AbortSignal,
): Promise<ModelCatalogItem[]> {
    const [rawModels, compatibleResponse] = await Promise.all([
        fetchJson(baseUrl, "/models", apiKey, signal),
        fetchCompatibleModelList(baseUrl, apiKey, signal),
    ]);
    const endpointById = new Map(
        ((compatibleResponse as ModelListResponse).data ?? []).map((model) => [
            model.id || model.name,
            model.supported_endpoints,
        ]),
    );

    return sortModels(
        ((Array.isArray(rawModels) ? rawModels : []) as RawModelInfo[])
            .map((model) => {
                const id = modelId(model);
                return {
                    ...model,
                    supported_endpoints:
                        model.supported_endpoints ?? endpointById.get(id),
                };
            })
            .map((model) => normalizeModel(model))
            .filter((model): model is ModelCatalogItem => Boolean(model)),
    );
}

function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47) {
        end -= 1;
    }
    return value.slice(0, end);
}

export async function fetchModelCatalog({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    signal,
}: FetchModelCatalogOptions = {}): Promise<ModelCatalog> {
    const normalizedBaseUrl = trimTrailingSlashes(baseUrl);
    const models = await fetchCatalogModels(normalizedBaseUrl, null, signal);
    const allowedModels = apiKey
        ? await fetchCatalogModels(normalizedBaseUrl, apiKey, signal)
        : [];

    const allowedModelIds = new Set(allowedModels.map((model) => model.id));

    return {
        models,
        allowedModelIds,
        allowedImageModelIds: idsForCategory(allowedModels, "image"),
        allowedVideoModelIds: idsForCategory(allowedModels, "video"),
        allowedTextModelIds: idsForCategory(allowedModels, "text"),
        allowedAudioModelIds: idsForCategory(allowedModels, "audio"),
        allowedEmbeddingModelIds: idsForCategory(allowedModels, "embedding"),
        allowedRealtimeModelIds: idsForCategory(allowedModels, "realtime"),
    };
}
