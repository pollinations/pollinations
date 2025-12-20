/**
 * Pollinations Model Cache
 *
 * Fetches and caches model lists from gen.pollinations.ai
 * Models are cached for 5 minutes to avoid excessive API calls
 */

import { getAuthHeaders } from "./authUtils.js";

const API_BASE_URL = "https://gen.pollinations.ai";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache storage
const cache = {
    imageModels: { data: null, timestamp: 0 },
    textModels: { data: null, timestamp: 0 },
};

/**
 * Check if cache entry is still valid
 * @param {Object} cacheEntry - Cache entry with data and timestamp
 * @returns {boolean}
 */
function isCacheValid(cacheEntry) {
    return (
        cacheEntry.data !== null &&
        Date.now() - cacheEntry.timestamp < CACHE_TTL
    );
}

/**
 * Fetch image models from the API
 * @param {boolean} forceRefresh - Force refresh even if cache is valid
 * @returns {Promise<Array>} - Array of image model objects
 */
export async function getImageModels(forceRefresh = false) {
    if (!forceRefresh && isCacheValid(cache.imageModels)) {
        return cache.imageModels.data;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/image/models`, {
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch image models: ${response.status}`);
        }

        const models = await response.json();
        cache.imageModels = { data: models, timestamp: Date.now() };
        return models;
    } catch (error) {
        // Return cached data if available, even if expired
        if (cache.imageModels.data) {
            console.error("Using cached image models due to fetch error:", error.message);
            return cache.imageModels.data;
        }
        throw error;
    }
}

/**
 * Fetch text models from the API
 * @param {boolean} forceRefresh - Force refresh even if cache is valid
 * @returns {Promise<Array>} - Array of text model objects
 */
export async function getTextModels(forceRefresh = false) {
    if (!forceRefresh && isCacheValid(cache.textModels)) {
        return cache.textModels.data;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/text/models`, {
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch text models: ${response.status}`);
        }

        const models = await response.json();
        cache.textModels = { data: models, timestamp: Date.now() };
        return models;
    } catch (error) {
        // Return cached data if available, even if expired
        if (cache.textModels.data) {
            console.error("Using cached text models due to fetch error:", error.message);
            return cache.textModels.data;
        }
        throw error;
    }
}

/**
 * Get list of image model names
 * @returns {Promise<string[]>}
 */
export async function getImageModelNames() {
    const models = await getImageModels();
    return models.map((m) => m.name);
}

/**
 * Get list of text model names
 * @returns {Promise<string[]>}
 */
export async function getTextModelNames() {
    const models = await getTextModels();
    return models.map((m) => m.name);
}

/**
 * Get audio voices from text models (openai-audio model)
 * @returns {Promise<string[]>}
 */
export async function getAudioVoices() {
    const models = await getTextModels();
    const audioModel = models.find((m) => m.name === "openai-audio");
    if (audioModel && Array.isArray(audioModel.voices)) {
        return audioModel.voices;
    }
    // Fallback voices if not found in API
    return ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage"];
}

/**
 * Validate if a model name is valid for image generation
 * @param {string} modelName - Model name to validate
 * @returns {Promise<boolean>}
 */
export async function isValidImageModel(modelName) {
    const names = await getImageModelNames();
    return names.includes(modelName);
}

/**
 * Validate if a model name is valid for text generation
 * @param {string} modelName - Model name to validate
 * @returns {Promise<boolean>}
 */
export async function isValidTextModel(modelName) {
    const names = await getTextModelNames();
    return names.includes(modelName);
}

/**
 * Get model info by name (image models)
 * @param {string} modelName - Model name
 * @returns {Promise<Object|null>}
 */
export async function getImageModelInfo(modelName) {
    const models = await getImageModels();
    return models.find((m) => m.name === modelName || m.aliases?.includes(modelName)) || null;
}

/**
 * Get model info by name (text models)
 * @param {string} modelName - Model name
 * @returns {Promise<Object|null>}
 */
export async function getTextModelInfo(modelName) {
    const models = await getTextModels();
    return models.find((m) => m.name === modelName || m.aliases?.includes(modelName)) || null;
}

/**
 * Clear all cached data
 */
export function clearModelCache() {
    cache.imageModels = { data: null, timestamp: 0 };
    cache.textModels = { data: null, timestamp: 0 };
}

/**
 * Get cache status for debugging
 * @returns {Object}
 */
export function getCacheStatus() {
    return {
        imageModels: {
            cached: cache.imageModels.data !== null,
            age: cache.imageModels.timestamp ? Date.now() - cache.imageModels.timestamp : null,
            count: cache.imageModels.data?.length || 0,
        },
        textModels: {
            cached: cache.textModels.data !== null,
            age: cache.textModels.timestamp ? Date.now() - cache.textModels.timestamp : null,
            count: cache.textModels.data?.length || 0,
        },
    };
}

/**
 * Validate image model and return helpful error if invalid
 * @param {string} modelName - Model name to validate
 * @returns {Promise<{valid: boolean, error?: string, suggestions?: string[]}>}
 */
export async function validateImageModel(modelName) {
    if (!modelName) {
        return { valid: true }; // Default model will be used
    }

    const models = await getImageModels();
    const model = models.find(m =>
        m.name === modelName || m.aliases?.includes(modelName)
    );

    if (model) {
        return { valid: true, model };
    }

    // Find similar models for suggestions
    const allNames = models.flatMap(m => [m.name, ...(m.aliases || [])]);
    const suggestions = allNames
        .filter(name => name.toLowerCase().includes(modelName.toLowerCase()) ||
                       modelName.toLowerCase().includes(name.toLowerCase()))
        .slice(0, 3);

    return {
        valid: false,
        error: `Unknown image model "${modelName}".`,
        suggestions: suggestions.length > 0 ? suggestions : allNames.slice(0, 5),
        availableCount: models.length,
    };
}

/**
 * Validate text model and return helpful error if invalid
 * @param {string} modelName - Model name to validate
 * @returns {Promise<{valid: boolean, error?: string, suggestions?: string[]}>}
 */
export async function validateTextModel(modelName) {
    if (!modelName) {
        return { valid: true }; // Default model will be used
    }

    const models = await getTextModels();
    const model = models.find(m =>
        m.name === modelName || m.aliases?.includes(modelName)
    );

    if (model) {
        return { valid: true, model };
    }

    // Find similar models for suggestions
    const allNames = models.flatMap(m => [m.name, ...(m.aliases || [])]);
    const suggestions = allNames
        .filter(name => name.toLowerCase().includes(modelName.toLowerCase()) ||
                       modelName.toLowerCase().includes(name.toLowerCase()))
        .slice(0, 3);

    return {
        valid: false,
        error: `Unknown text model "${modelName}".`,
        suggestions: suggestions.length > 0 ? suggestions : allNames.slice(0, 5),
        availableCount: models.length,
    };
}
