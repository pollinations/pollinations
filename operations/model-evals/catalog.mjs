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
        return [
            ...new Map(selected.map((model) => [model.name, model])).values(),
        ];
    }

    if (scope === "community") {
        return models.filter((model) => model.community === true);
    }
    if (scope === "official") {
        return models.filter((model) => model.community !== true);
    }
    return selected;
}

// Catalog-priced token cost, not a wallet reconciliation. Null means the
// response did not report usable usage; never silently label that as free.
export function requestCostPollen(model, usage) {
    const pricing = model.pricing;
    if (!pricing || !usage) return null;
    const prompt = usage.prompt_tokens;
    const completion = usage.completion_tokens;
    if (![prompt, completion].every((n) => Number.isFinite(n) && n >= 0))
        return null;
    const cached = Math.min(
        prompt,
        Math.max(
            0,
            usage.prompt_tokens_details?.cached_tokens ??
                usage.prompt_cache_tokens ??
                0,
        ),
    );
    const written = Math.min(
        prompt - cached,
        Math.max(
            0,
            usage.prompt_tokens_details?.cache_write_tokens ??
                usage.cache_creation_input_tokens ??
                0,
        ),
    );
    const reasoning = Math.max(
        0,
        usage.completion_tokens_details?.reasoning_tokens ?? 0,
    );
    // OpenAI includes reasoning in completion_tokens; some providers add it
    // separately, as indicated by total_tokens.
    const additive =
        usage.total_tokens === prompt + completion + reasoning && reasoning > 0;
    const reasoningTokens = additive
        ? reasoning
        : Math.min(completion, reasoning);
    const textTokens = additive ? completion : completion - reasoningTokens;
    const rate = (key, fallback = 0) => Number(pricing[key] ?? fallback);
    const cost =
        (prompt - cached - written) * rate("promptTextTokens") +
        cached * rate("promptCachedTokens", pricing.promptTextTokens) +
        written * rate("promptCacheWriteTokens", pricing.promptTextTokens) +
        textTokens * rate("completionTextTokens") +
        reasoningTokens *
            rate("completionReasoningTokens", pricing.completionTextTokens);
    return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

// Conservative reservation before dispatch, shared by concurrent workers.
// Byte count bounds ordinary text tokenization; headroom covers chat wrappers.
// This is an estimate, not a provider-enforced spending limit. A provider that
// ignores max_tokens or bills extra work can exceed it, so report that clearly.
export function estimateRequestCost(model, question, maxTokens) {
    if (!model.pricing) return Infinity;
    const rates = (keys) => keys.map((key) => Number(model.pricing[key] ?? 0));
    const promptRates = rates([
        "promptTextTokens",
        "promptCachedTokens",
        "promptCacheWriteTokens",
    ]);
    const completionRates = rates([
        "completionTextTokens",
        "completionReasoningTokens",
    ]);
    if (
        ![...promptRates, ...completionRates].every(
            (n) => Number.isFinite(n) && n >= 0,
        )
    )
        return Infinity;
    return (
        (new TextEncoder().encode(question.prompt).length + 1024) *
            Math.max(...promptRates) +
        maxTokens * Math.max(...completionRates)
    );
}
