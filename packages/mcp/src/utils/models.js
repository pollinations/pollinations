import { getAuthHeaders } from "./authUtils.js";
import { buildUrl } from "./coreUtils.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

async function fetchCached(path) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(buildUrl(path), {
        headers: getAuthHeaders(),
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    const data = await response.json();
    cache.set(path, { data, at: Date.now() });
    return data;
}

export const getImageModels = () => fetchCached("/image/models");
export const getTextModels = () => fetchCached("/text/models");

export async function getVideoModels() {
    const models = await getImageModels();
    return models.filter((m) => m.output_modalities?.includes("video"));
}

async function validateAgainstRegistry(modelName, fetcher, kind) {
    if (!modelName) return { valid: true };
    const models = await fetcher();
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

export const validateImageModel = (name) =>
    validateAgainstRegistry(name, getImageModels, "image");

export const validateTextModel = (name) =>
    validateAgainstRegistry(name, getTextModels, "text");

export const validateVideoModel = (name) =>
    validateAgainstRegistry(name, getVideoModels, "video");
