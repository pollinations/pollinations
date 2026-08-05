import {
    type ModelInfo,
    PollinationsError,
    type RequestOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

export interface ModelCatalog {
    models: ModelInfo[];
    allowedModelIds: Set<string>;
}

export interface FetchModelCatalogOptions extends RequestOptions {
    apiKey?: string | null;
    baseUrl?: string;
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
): Promise<ModelInfo[]> {
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

    return rawModels as ModelInfo[];
}

export async function fetchModelCatalog({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    signal,
}: FetchModelCatalogOptions = {}): Promise<ModelCatalog> {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

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
        allowedModelIds: new Set(
            allowedModels.map((model) => model.id ?? model.name),
        ),
    };
}
