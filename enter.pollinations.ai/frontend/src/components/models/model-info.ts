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
    | "reasoning"
    | "web_search"
    | "code_execution";

export const getModelCapabilities = (
    model: ModelPrice,
): DisplayCapability[] => {
    const keys: DisplayCapability[] = [];

    if (model.agent) keys.push("agent");
    if (hasReasoning(model)) keys.push("reasoning");
    if (hasSearch(model)) keys.push("web_search");
    if (hasCodeExecution(model)) keys.push("code_execution");

    return keys;
};

export const getModelCapabilityLabel = (model: ModelPrice): string => {
    const labels: string[] = [];

    if (model.agent) labels.push("Agent");
    if (hasReasoning(model)) labels.push("Reasoning");
    if (hasSearch(model)) labels.push("Web search");
    if (hasCodeExecution(model)) labels.push("Code execution");

    return labels.join(", ");
};

const hasCapability = (
    model: ModelPrice,
    capability: ModelCapability,
): boolean => model.capabilities.includes(capability);

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
 * Format a context length (in tokens) as a human-readable string.
 * e.g. 128000 → "128K", 8000 → "8K", 2000000 → "2M"
 */
export const formatContextLength = (length: number): string => {
    if (length >= 1_000_000) return `${Math.round(length / 1_000_000)}M`;
    if (length >= 1_000) return `${Math.round(length / 1_000)}K`;
    return `${length}`;
};

/**
 * Format a video duration range as a human-readable string.
 * e.g. {min: 5, max: 15} → "5–15s", {min: 5, max: 5} → "5s"
 */
export const formatDuration = (range: { min: number; max: number }): string => {
    if (range.min === range.max) return `${range.min}s`;
    return `${range.min}–${range.max}s`;
};

/**
 * Get a human-readable limit string for a model, combining context length
 * and/or video duration as applicable.
 */
export const getModelLimitLabel = (model: ModelPrice): string | undefined => {
    const parts: string[] = [];
    if (model.contextLength) {
        parts.push(`${formatContextLength(model.contextLength)} context`);
    }
    if (model.durationSeconds) {
        parts.push(`${formatDuration(model.durationSeconds)} video`);
    }
    return parts.length > 0 ? parts.join(", ") : undefined;
};
