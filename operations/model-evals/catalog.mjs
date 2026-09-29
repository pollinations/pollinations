// Model catalog access: which text models exist, and which to score.

export const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

// The short name of a model without the vendor or community path, with
// variant suffixes kept: "community/Saauf/gpt-6-luna" -> "gpt-6-luna",
// "openai/gpt-5.4-nano" -> "gpt-5.4-nano".
export function shortName(modelName) {
    return modelName.split("/").pop();
}

// Variant markers community models often carry; "gpt-6-sol:stable" and
// "gpt-6-sol" name the same base model.
export function baseName(modelName) {
    return shortName(modelName).split(":")[0];
}

export async function fetchTextModels(
    baseUrl = DEFAULT_BASE_URL,
    fetchFn = fetch,
) {
    const response = await fetchFn(`${baseUrl}/text/models`);
    if (!response.ok) {
        throw new Error(`Model list request failed: ${response.status}`);
    }
    const models = await response.json();
    if (!Array.isArray(models)) {
        throw new Error("Model list response was not an array");
    }
    return models.filter((model) => model?.category === "text");
}

// Selects the models to score. `names` (model names or aliases) selects an
// explicit list, `scope` filters to "community" or "official" models, and
// the default scores every text model.
export function selectModels(models, { names, scope } = {}) {
    let selected = models;

    if (names && names.length > 0) {
        // Accept full catalog names, aliases, short names
        // ("community/Saauf/gpt-6-luna" -> "gpt-6-luna") and variant-
        // stripped base names ("gpt-6-sol:stable" -> "gpt-6-sol").
        const index = new Map();
        const addKeys = (name, model) => {
            for (const key of new Set([
                name.toLowerCase(),
                shortName(name).toLowerCase(),
                baseName(name).toLowerCase(),
            ])) {
                if (!index.has(key)) index.set(key, model);
            }
        };
        for (const model of models) {
            addKeys(model.name, model);
            for (const alias of model.aliases ?? []) {
                addKeys(alias, model);
            }
        }
        selected = names.map((name) => index.get(name.toLowerCase()));
        const missing = selected
            .map((model, index) => (model ? null : names[index]))
            .filter((name) => name !== null);
        if (missing.length > 0) {
            throw new Error(`Unknown model(s): ${missing.join(", ")}`);
        }
        return selected;
    }

    if (scope === "community") {
        return models.filter((model) => model.community === true);
    }
    if (scope === "official") {
        return models.filter((model) => model.community !== true);
    }
    return selected;
}

// Pollen cost of one request computed from the catalog pricing and the
// usage block of the response.
export function requestCostPollen(model, usage) {
    const pricing = model.pricing;
    if (!pricing || !usage) return 0;
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const cachedTokens =
        usage.prompt_tokens_details?.cached_tokens ??
        usage.prompt_cache_tokens ??
        0;
    const uncachedPromptTokens = Math.max(promptTokens - cachedTokens, 0);
    return (
        uncachedPromptTokens *
            Number.parseFloat(pricing.promptTextTokens ?? 0) +
        cachedTokens * Number.parseFloat(pricing.promptCachedTokens ?? 0) +
        completionTokens * Number.parseFloat(pricing.completionTextTokens ?? 0)
    );
}
