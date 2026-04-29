import { getAuthHeaders } from "./authUtils.js";

const API_BASE_URL = "https://gen.pollinations.ai";
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
const inFlight = new Map();

async function fetchCached(path) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

    const pending = inFlight.get(path);
    if (pending) return pending;

    const promise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(`${API_BASE_URL}${path}`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            throw new Error(`Failed to fetch ${path}: ${response.status}`);
        }
        const data = await response.json();
        cache.set(path, { data, at: Date.now() });
        return data;
    })().finally(() => inFlight.delete(path));

    inFlight.set(path, promise);
    return promise;
}

export const getImageModels = () => fetchCached("/image/models");
export const getTextModels = () => fetchCached("/text/models");
export const getAudioModels = () => fetchCached("/audio/models");

export async function getVideoModels() {
    const models = await getImageModels();
    return models.filter((m) => m.output_modalities?.includes("video"));
}

export async function getAudioVoices() {
    try {
        const audioModels = await getAudioModels();
        const voices = new Set();
        for (const m of audioModels) {
            if (Array.isArray(m.voices)) {
                for (const v of m.voices) voices.add(v);
            }
        }
        if (voices.size > 0) return Array.from(voices);
    } catch {}
    // Last-resort fallback. Registry normally covers this.
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

export async function validateVoice(voice) {
    if (!voice) return { valid: true };
    const voices = await getAudioVoices();
    if (voices.includes(voice)) return { valid: true };
    const lower = voice.toLowerCase();
    const suggestions = voices
        .filter(
            (v) =>
                v.toLowerCase().includes(lower) ||
                lower.includes(v.toLowerCase()),
        )
        .slice(0, 3);
    return {
        valid: false,
        error: `Unknown voice "${voice}".`,
        suggestions: suggestions.length > 0 ? suggestions : voices.slice(0, 8),
        availableCount: voices.length,
    };
}
