import type { ModelInfo, RequestOptions } from "./types.js";
import { PollinationsError } from "./types.js";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

export type ModelCatalogSource = "image" | "text" | "audio";
export type ModelCatalogCategory = "image" | "video" | "text" | "audio";

export interface ModelCatalogItem {
    id: string;
    name: string;
    description?: string;
    aliases: string[];
    source: ModelCatalogSource;
    category: ModelCatalogCategory;
    inputModalities: string[];
    outputModalities: string[];
    voices: string[];
    paidOnly: boolean;
    tools: boolean;
    reasoning: boolean;
}

export interface ModelCatalog {
    models: ModelCatalogItem[];
    allowedModelIds: Set<string>;
    allowedImageModelIds: Set<string>;
    allowedVideoModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
}

export interface FetchModelCatalogOptions extends RequestOptions {
    apiKey?: string | null;
    baseUrl?: string;
}

type RawModelInfo = ModelInfo & {
    output_modalities?: string[];
    input_modalities?: string[];
    paid_only?: boolean;
};

function modelId(model: RawModelInfo): string {
    return model.id || model.name;
}

function endpointFor(source: ModelCatalogSource): string {
    return source === "image"
        ? "/image/models"
        : source === "text"
          ? "/text/models"
          : "/audio/models";
}

function isModelCatalogCategory(value: unknown): value is ModelCatalogCategory {
    return (
        value === "image" ||
        value === "video" ||
        value === "text" ||
        value === "audio"
    );
}

function legacyCategoryFor(
    model: RawModelInfo,
    source: ModelCatalogSource,
): ModelCatalogCategory | null {
    const output = model.output_modalities ?? [];
    const input = model.input_modalities ?? [];

    if (source === "image") {
        if (output.includes("video")) return "video";
        if (output.includes("image")) return "image";
        return null;
    }

    if (source === "text") {
        if (output.includes("audio")) return "audio";
        if (output.includes("text")) return "text";
        return null;
    }

    if (output.includes("audio") && input.includes("text")) return "audio";
    return null;
}

function categoryFor(
    model: RawModelInfo,
    source: ModelCatalogSource,
): ModelCatalogCategory | null {
    if (isModelCatalogCategory(model.category)) return model.category;
    return legacyCategoryFor(model, source);
}

function normalizeModel(
    model: RawModelInfo,
    source: ModelCatalogSource,
): ModelCatalogItem | null {
    const id = modelId(model);
    const category = categoryFor(model, source);
    if (!id || !category) return null;

    return {
        id,
        name: model.name || id,
        description: model.description,
        aliases: model.aliases ?? [],
        source,
        category,
        inputModalities: model.input_modalities ?? [],
        outputModalities: model.output_modalities ?? [],
        voices: model.voices ?? [],
        paidOnly: model.paid_only ?? false,
        tools: model.tools ?? false,
        reasoning: model.reasoning ?? false,
    };
}

function sortModels(models: ModelCatalogItem[]): ModelCatalogItem[] {
    const order: Record<ModelCatalogCategory, number> = {
        image: 0,
        video: 1,
        text: 2,
        audio: 3,
    };

    return [...models].sort((a, b) => {
        const categoryDelta = order[a.category] - order[b.category];
        if (categoryDelta !== 0) return categoryDelta;
        return a.id.localeCompare(b.id);
    });
}

async function fetchModels(
    baseUrl: string,
    source: ModelCatalogSource,
    apiKey: string | null | undefined,
    signal?: AbortSignal,
): Promise<ModelCatalogItem[]> {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(`${baseUrl}${endpointFor(source)}`, {
        headers,
        signal,
    });

    if (!response.ok) {
        throw new PollinationsError(
            `Failed to fetch ${source} models`,
            "MODEL_CATALOG",
            response.status,
        );
    }

    const rawModels = (await response.json()) as RawModelInfo[];
    return rawModels
        .map((model) => normalizeModel(model, source))
        .filter((model): model is ModelCatalogItem => Boolean(model));
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
    const [imageModels, textModels, audioModels] = await Promise.all([
        fetchModels(baseUrl, "image", apiKey, signal),
        fetchModels(baseUrl, "text", apiKey, signal),
        fetchModels(baseUrl, "audio", apiKey, signal),
    ]);

    return sortModels([...imageModels, ...textModels, ...audioModels]);
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
    };
}
