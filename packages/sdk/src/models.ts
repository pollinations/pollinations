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
}

export interface FetchModelCatalogOptions extends RequestOptions {
    apiKey?: string | null;
    baseUrl?: string;
}

function modelId(model: ModelInfo): string {
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

function legacyCategoryFor(model: ModelInfo): ModelCatalogCategory | null {
    const output = model.output_modalities ?? [];

    if (output.includes("embedding")) return "embedding";
    if (output.includes("video")) return "video";
    if (output.includes("image")) return "image";
    if (output.includes("audio")) return "audio";
    if (output.includes("text")) return "text";
    return null;
}

function categoryFor(model: ModelInfo): ModelCatalogCategory | null {
    if (isModelCatalogCategory(model.category)) return model.category;
    return legacyCategoryFor(model);
}

function normalizeModel(model: ModelInfo): ModelCatalogItem | null {
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

async function fetchCatalogModels(
    baseUrl: string,
    apiKey: string | null | undefined,
    signal?: AbortSignal,
): Promise<ModelCatalogItem[]> {
    const rawModels = await fetchJson(baseUrl, "/models", apiKey, signal);

    return sortModels(
        ((Array.isArray(rawModels) ? rawModels : []) as ModelInfo[])
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
    };
}
