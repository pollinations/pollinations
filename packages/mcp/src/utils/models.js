import { getAuthHeaders } from "./authUtils.js";
import { buildUrl } from "./coreUtils.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

const MODEL_PATHS = {
    all: "/models",
    text: "/text/models",
    image: "/image/models",
    video: "/video/models",
    audio: "/audio/models",
    embedding: "/embeddings/models",
    "3d": "/3d/models",
};

async function fetchCached(url, context) {
    const isRequestScoped = Boolean(context?.http?.authInfo?.token);
    const hit = cache.get(url);
    if (!isRequestScoped && hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.data;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
        headers: getAuthHeaders(context),
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
        throw new Error(`Failed to fetch model registry: ${response.status}`);
    }
    const data = await response.json();
    if (!isRequestScoped) cache.set(url, { data, at: Date.now() });
    return data;
}

export function getModels(type = "all", context, community) {
    const path = MODEL_PATHS[type];
    if (!path) throw new Error(`Unknown model type: ${type}`);
    return fetchCached(buildUrl(path, { community }), context);
}

export const getImageModels = (context) => getModels("image", context);
export const getTextModels = (context) => getModels("text", context);
export const getVideoModels = (context) => getModels("video", context);
export const getEmbeddingModels = (context) => getModels("embedding", context);
export const getModel3dModels = (context) => getModels("3d", context);

async function validateAgainstRegistry(modelName, fetcher, kind, context) {
    if (!modelName) return { valid: true };
    const models = await fetcher(context);
    const model = models.find(
        (m) => m.name === modelName || m.aliases?.includes(modelName),
    );
    if (model) return { valid: true, model };

    const allNames = models.flatMap((m) => [m.name, ...(m.aliases || [])]);
    const lower = modelName.toLowerCase();
    const suggestions = allNames
        .filter(
            (name) =>
                name.toLowerCase().includes(lower) ||
                lower.includes(name.toLowerCase()),
        )
        .slice(0, 3);
    return {
        valid: false,
        error: `Unknown ${kind} model "${modelName}".`,
        suggestions:
            suggestions.length > 0 ? suggestions : allNames.slice(0, 5),
        availableCount: models.length,
    };
}

export const validateImageModel = (name, context) =>
    validateAgainstRegistry(name, getImageModels, "image", context);

export const validateTextModel = (name, context) =>
    validateAgainstRegistry(name, getTextModels, "text", context);

export const validateVideoModel = (name, context) =>
    validateAgainstRegistry(name, getVideoModels, "video", context);

export const validateEmbeddingModel = (name, context) =>
    validateAgainstRegistry(name, getEmbeddingModels, "embedding", context);

export const validateModel3d = (name, context) =>
    validateAgainstRegistry(name, getModel3dModels, "3D", context);
