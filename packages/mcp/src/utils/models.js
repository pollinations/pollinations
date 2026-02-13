import { getAuthHeaders } from "./authUtils.js";

const API_BASE_URL = "https://gen.pollinations.ai";

export async function getImageModels() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${API_BASE_URL}/image/models`, {
        headers: getAuthHeaders(),
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
        throw new Error(`Failed to fetch image models: ${response.status}`);
    }

    return response.json();
}

export async function getTextModels() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${API_BASE_URL}/text/models`, {
        headers: getAuthHeaders(),
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
        throw new Error(`Failed to fetch text models: ${response.status}`);
    }

    return response.json();
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
