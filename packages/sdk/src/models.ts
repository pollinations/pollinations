import {
    MODEL_CATEGORIES,
    type ModelCategory,
    type ModelInfo,
    PollinationsError,
    type RequestOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

/** A single entry in the public model catalog. Curated, camelCase, and stable —
 * intentionally a small subset of the raw `ModelInfo` wire shape. */
export interface ModelCatalogItem {
    id: string;
    name: string;
    title: string;
    category: ModelCategory;
    brand?: string;
    description?: string;
    aliases: string[];
    inputModalities: string[];
    outputModalities: string[];
    videoCapabilities: string[];
    maxReferenceImages?: number;
    maxReferenceVideos?: number;
    voices: string[];
    paidOnly: boolean;
    tools: boolean;
    reasoning: boolean;
    contextLength?: number;
    pricing?: Record<string, string> & { currency: "pollen" };
}

export interface ModelCatalog {
    models: ModelCatalogItem[];
    allowedModelIds: Set<string>;
}

export interface FetchModelCatalogOptions extends RequestOptions {
    apiKey?: string | null;
    baseUrl?: string;
}

/** Humanize a camelCase pricing key, e.g. "promptTextTokens" -> "prompt text tokens". */
function humanizePricingKey(key: string): string {
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * Pricing as display-ready `[label, value]` pairs, with the `currency` marker
 * dropped and keys humanized. Every consumer rendering pricing needs this, so it
 * lives here rather than being re-derived per app.
 */
export function pricingEntries(
    pricing: ModelCatalogItem["pricing"],
): Array<[label: string, value: string]> {
    return Object.entries(pricing ?? {})
        .filter(([key]) => key !== "currency")
        .map(([key, value]) => [humanizePricingKey(key), value]);
}

function isModelCategory(value: unknown): value is ModelCategory {
    return MODEL_CATEGORIES.includes(value as ModelCategory);
}

function normalizeModel(model: ModelInfo): ModelCatalogItem | null {
    const id = model.id ?? model.name;
    if (!id || !isModelCategory(model.category)) return null;

    return {
        id,
        name: model.name,
        title: model.title ?? model.name,
        category: model.category,
        brand: model.brand,
        description: model.description,
        aliases: model.aliases ?? [],
        inputModalities: model.input_modalities ?? [],
        outputModalities: model.output_modalities ?? [],
        videoCapabilities: model.video_capabilities ?? [],
        maxReferenceImages: model.max_reference_images,
        maxReferenceVideos: model.max_reference_videos,
        voices: model.voices ?? [],
        paidOnly: model.paid_only ?? false,
        tools: model.tools ?? false,
        reasoning: model.reasoning ?? false,
        contextLength: model.context_length,
        pricing: model.pricing,
    };
}

function sortModels(models: ModelCatalogItem[]): ModelCatalogItem[] {
    return [...models].sort((a, b) => {
        const delta =
            MODEL_CATEGORIES.indexOf(a.category) -
            MODEL_CATEGORIES.indexOf(b.category);
        if (delta !== 0) return delta;
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

    const response = await fetch(`${baseUrl}${path}`, { headers, signal });

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
    // A 2xx response with a non-array body means the endpoint returned
    // something unexpected (e.g. an error envelope). Surface it instead of
    // silently treating it as an empty catalog.
    if (!Array.isArray(rawModels)) {
        throw new PollinationsError(
            "Model catalog endpoint /models returned a non-array response",
            "MODEL_CATALOG",
            502,
        );
    }

    return sortModels(
        (rawModels as ModelInfo[])
            .map(normalizeModel)
            .filter((model): model is ModelCatalogItem => model !== null),
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

    // Two calls to the same /models endpoint, on purpose: the anonymous call
    // returns the full public catalog (`models`); the authenticated call returns
    // only the models this key may use (`allowedModelIds`). They're different
    // lists — don't collapse this into one request.
    const models = await fetchCatalogModels(normalizedBaseUrl, null, signal);
    const allowedModels = apiKey
        ? await fetchCatalogModels(normalizedBaseUrl, apiKey, signal)
        : [];

    return {
        models,
        allowedModelIds: new Set(allowedModels.map((model) => model.id)),
    };
}
