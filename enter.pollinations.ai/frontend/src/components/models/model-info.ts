import type { ModelCapability, ModelPrice } from "./types.ts";

const BRAND_LOGOS: Record<string, string> = {
    Alibaba: "alibaba",
    Amazon: "amazon",
    Anthropic: "anthropic",
    AssemblyAI: "assemblyai",
    "Black Forest Labs": "black-forest-labs",
    ByteDance: "bytedance",
    Cohere: "cohere",
    Deemos: "deemos",
    DeepSeek: "deepseek",
    ElevenLabs: "elevenlabs",
    "Fish Audio": "fish-audio",
    Google: "google",
    Hexgrad: "hexgrad",
    Ideogram: "ideogram",
    Inception: "inception",
    Krea: "krea",
    Lykon: "lykon",
    Meituan: "meituan",
    Meta: "meta",
    Microsoft: "microsoft",
    MiniMax: "minimax",
    Mistral: "mistral",
    "Moonshot AI": "moonshot",
    NVIDIA: "nvidia",
    OpenAI: "openai",
    Perplexity: "perplexity",
    Pollinations: "pollinations",
    Poolside: "poolside",
    Pruna: "pruna",
    Qwen: "qwen",
    Recraft: "recraft",
    Sesame: "sesame",
    "Stability AI": "stability",
    StepFun: "stepfun",
    "Thinking Machines": "thinking-machines",
    Xiaomi: "xiaomi",
    "Z.ai": "zai",
    xAI: "xai",
};

const getInputModalities = (model: ModelPrice): string[] =>
    model.inputModalities || ["text"];

export const getModelDisplayName = (model: ModelPrice): string | undefined => {
    if (model.displayName) return model.displayName;
    const description = model.description;
    if (!description) return undefined;
    return description.split(" - ")[0];
};

export const getModelDescriptionWithoutName = (
    model: ModelPrice,
): string | undefined => model.description || undefined;

export const getModelBrandLogoPath = (
    model: ModelPrice,
): string | undefined => {
    if (model.community) return undefined;
    const logoName = model.brand ? BRAND_LOGOS[model.brand] : undefined;
    return logoName ? `/brand-logos/${logoName}.svg` : undefined;
};

export type InputModality = "text" | "image" | "video" | "audio";

export const getModelInputModalities = (model: ModelPrice): InputModality[] => {
    const modalities = getInputModalities(model);
    const keys: InputModality[] = [];

    if (modalities.includes("text")) keys.push("text");
    if (modalities.includes("image")) keys.push("image");
    if (modalities.includes("video")) keys.push("video");
    if (modalities.includes("audio")) keys.push("audio");

    return keys;
};

export const getModelModalityLabel = (model: ModelPrice): string => {
    const modalities = getModelInputModalities(model);
    return modalities.length > 0 ? `Input: ${modalities.join(", ")}` : "Input";
};

export type DisplayCapability =
    | "agent"
    | "tool_calling"
    | "reasoning"
    | "web_search"
    | "code_execution";

export const getModelCapabilities = (
    model: ModelPrice,
): DisplayCapability[] => {
    const keys: DisplayCapability[] = [];

    if (model.agent) keys.push("agent");
    if (hasToolCalling(model)) keys.push("tool_calling");
    if (hasReasoning(model)) keys.push("reasoning");
    if (hasSearch(model)) keys.push("web_search");
    if (hasCodeExecution(model)) keys.push("code_execution");

    return keys;
};

export const getModelCapabilityLabel = (model: ModelPrice): string => {
    const labels: string[] = [];

    if (model.agent) labels.push("Agent");
    if (hasToolCalling(model)) labels.push("Tool calling");
    if (hasReasoning(model)) labels.push("Reasoning");
    if (hasSearch(model)) labels.push("Web search");
    if (hasCodeExecution(model)) labels.push("Code execution");

    return labels.join(", ");
};

const hasCapability = (
    model: ModelPrice,
    capability: ModelCapability,
): boolean => model.capabilities.includes(capability);

const hasToolCalling = (model: ModelPrice): boolean =>
    hasCapability(model, "tool_calling");

const hasReasoning = (model: ModelPrice): boolean =>
    hasCapability(model, "reasoning");

const hasSearch = (model: ModelPrice): boolean =>
    hasCapability(model, "web_search");

const hasCodeExecution = (model: ModelPrice): boolean =>
    hasCapability(model, "code_execution");

export const hasPollinationsTools = (model: ModelPrice): boolean =>
    hasCapability(model, "pollinations_models");

/**
 * Check if a model is "new" (added within the last 7 days).
 * Uses the `addedDate` field, which is set once on creation and never updated.
 */
export const isNewModel = (model: ModelPrice): boolean => {
    if (!model.addedDate) return false;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return model.addedDate > sevenDaysAgo;
};

/**
 * Check if a model requires paid balance only, not Quest Pollen.
 */
export const isPaidOnly = (model: ModelPrice): boolean =>
    model.paidOnly === true;

/**
 * Check if a model is marked as alpha (experimental, potentially unstable)
 */
export const isAlpha = (model: ModelPrice): boolean => model.alpha === true;

/**
 * Format a context-window size compactly: 128000 -> "128K", 1000000 -> "1M".
 * @param tokens - context length in tokens.
 * @returns compact label, or undefined for an absent/invalid value.
 */
export const formatContextLength = (tokens: number | undefined): string | undefined => {
    if (tokens === undefined || !Number.isFinite(tokens) || tokens <= 0) return undefined;
    if (tokens >= 1_000_000) {
        const m = tokens / 1_000_000;
        return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
        const k = tokens / 1_000;
        return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
    }
    return String(tokens);
};

/**
 * Resolve the supported duration range or fixed duration for video models.
 * @param model - model price entry with optional duration metadata.
 * @returns compact label like "2s–30s" or "5s", or undefined when no metadata exists.
 */
export const getModelDurationLabel = (model: ModelPrice): string | undefined => {
    const { minDuration, maxDuration, defaultDuration } = model;
    if (minDuration !== undefined && maxDuration !== undefined) {
        return minDuration === maxDuration
            ? `${minDuration}s`
            : `${minDuration}s–${maxDuration}s`;
    }
    if (defaultDuration !== undefined) return `${defaultDuration}s`;
    if (minDuration !== undefined) return `${minDuration}s+`;
    if (maxDuration !== undefined) return `≤${maxDuration}s`;
    return undefined;
};
