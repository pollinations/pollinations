import { getAuthHeaders } from "./authUtils.js";

const API_BASE_URL = "https://gen.pollinations.ai";
const CACHE_TTL = 5 * 60 * 1000;

const cache = {
    imageModels: { data: null, timestamp: 0 },
    textModels: { data: null, timestamp: 0 },
};

function isCacheValid(cacheEntry) {
    return (
        cacheEntry.data !== null &&
        Date.now() - cacheEntry.timestamp < CACHE_TTL
    );
}

export async function getImageModels(forceRefresh = false) {
    if (!forceRefresh && isCacheValid(cache.imageModels)) {
        return cache.imageModels.data;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(`${API_BASE_URL}/image/models`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            throw new Error(`Failed to fetch image models: ${response.status}`);
        }

        const models = await response.json();
        cache.imageModels = { data: models, timestamp: Date.now() };
        return models;
    } catch (error) {
        if (cache.imageModels.data) {
            console.warn(
                "Using cached image models due to fetch error:",
                error.message,
            );
            return cache.imageModels.data;
        }
        throw error;
    }
}

export async function getTextModels(forceRefresh = false) {
    if (!forceRefresh && isCacheValid(cache.textModels)) {
        return cache.textModels.data;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(`${API_BASE_URL}/text/models`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            throw new Error(`Failed to fetch text models: ${response.status}`);
        }

        const models = await response.json();
        cache.textModels = { data: models, timestamp: Date.now() };
        return models;
    } catch (error) {
        if (cache.textModels.data) {
            console.warn(
                "Using cached text models due to fetch error:",
                error.message,
            );
            return cache.textModels.data;
        }
        throw error;
    }
}

export async function getImageModelNames() {
    const models = await getImageModels();
    return models.map((m) => m.name);
}

export async function getTextModelNames() {
    const models = await getTextModels();
    return models.map((m) => m.name);
}

export async function getAudioVoices() {
    const models = await getTextModels();
    const audioModel = models.find((m) => m.name === "openai-audio");
    if (audioModel && Array.isArray(audioModel.voices)) {
        return audioModel.voices;
    }
    return [
        "alloy",
        "echo",
        "fable",
        "onyx",
        "nova",
        "shimmer",
        "coral",
        "verse",
        "ballad",
        "ash",
        "sage",
    ];
}

export async function isValidImageModel(modelName) {
    const names = await getImageModelNames();
    return names.includes(modelName);
}

export async function isValidTextModel(modelName) {
    const names = await getTextModelNames();
    return names.includes(modelName);
}

export async function getImageModelInfo(modelName) {
    const models = await getImageModels();
    return (
        models.find(
            (m) => m.name === modelName || m.aliases?.includes(modelName),
        ) || null
    );
}

export async function getTextModelInfo(modelName) {
    const models = await getTextModels();
    return (
        models.find(
            (m) => m.name === modelName || m.aliases?.includes(modelName),
        ) || null
    );
}

export function clearModelCache() {
    cache.imageModels = { data: null, timestamp: 0 };
    cache.textModels = { data: null, timestamp: 0 };
}

export function getCacheStatus() {
    return {
        imageModels: {
            cached: cache.imageModels.data !== null,
            age: cache.imageModels.timestamp
                ? Date.now() - cache.imageModels.timestamp
                : null,
            count: cache.imageModels.data?.length || 0,
        },
        textModels: {
            cached: cache.textModels.data !== null,
            age: cache.textModels.timestamp
                ? Date.now() - cache.textModels.timestamp
                : null,
            count: cache.textModels.data?.length || 0,
        },
    };
}

export async function validateImageModel(modelName) {
    if (!modelName) {
        return { valid: true };
    }

    const models = await getImageModels();
    const model = models.find(
        (m) => m.name === modelName || m.aliases?.includes(modelName),
    );

    if (model) {
        return { valid: true, model };
    }

    const allNames = models.flatMap((m) => [m.name, ...(m.aliases || [])]);
    const suggestions = allNames
        .filter(
            (name) =>
                name.toLowerCase().includes(modelName.toLowerCase()) ||
                modelName.toLowerCase().includes(name.toLowerCase()),
        )
        .slice(0, 3);

    return {
        valid: false,
        error: `Unknown image model "${modelName}".`,
        suggestions:
            suggestions.length > 0 ? suggestions : allNames.slice(0, 5),
        availableCount: models.length,
    };
}

export async function validateTextModel(modelName) {
    if (!modelName) {
        return { valid: true };
    }

    const models = await getTextModels();
    const model = models.find(
        (m) => m.name === modelName || m.aliases?.includes(modelName),
    );

    if (model) {
        return { valid: true, model };
    }

    const allNames = models.flatMap((m) => [m.name, ...(m.aliases || [])]);
    const suggestions = allNames
        .filter(
            (name) =>
                name.toLowerCase().includes(modelName.toLowerCase()) ||
                modelName.toLowerCase().includes(name.toLowerCase()),
        )
        .slice(0, 3);

    return {
        valid: false,
        error: `Unknown text model "${modelName}".`,
        suggestions:
            suggestions.length > 0 ? suggestions : allNames.slice(0, 5),
        availableCount: models.length,
    };
}
