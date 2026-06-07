import type { Modalities, ModelCapability, ModelPrice } from "./types.ts";

const BRAND_LOGOS: Record<string, string> = {
    "ACE-Step": "ace-step",
    Alibaba: "alibaba",
    Amazon: "amazon",
    Anthropic: "anthropic",
    AssemblyAI: "assemblyai",
    "Black Forest Labs": "black-forest-labs",
    ByteDance: "bytedance",
    Cohere: "cohere",
    DeepSeek: "deepseek",
    ElevenLabs: "elevenlabs",
    Google: "google",
    Lightricks: "lightricks",
    Meta: "meta",
    MiniMax: "minimax",
    Mistral: "mistral",
    "Moonshot AI": "moonshot",
    OpenAI: "openai",
    Perplexity: "perplexity",
    Pollinations: "pollinations",
    Pruna: "pruna",
    Qwen: "qwen",
    StepFun: "stepfun",
    "Z.ai": "zai",
    xAI: "xai",
};

const MODEL_LOGOS: Record<string, string> = {};

const getSourceDescription = (model: ModelPrice): string | undefined => {
    if (!model.description) return model.displayName;
    return model.displayName
        ? `${model.displayName} - ${model.description}`
        : model.description;
};

export const getModalities = (model: ModelPrice): Modalities => {
    return {
        input: model.inputModalities || ["text"],
        output: model.outputModalities || ["text"],
    };
};

export const getModelDescription = (model: ModelPrice): string | undefined => {
    return getSourceDescription(model);
};

export const getModelDisplayName = (model: ModelPrice): string | undefined => {
    if (model.displayName) return model.displayName;
    const description = getSourceDescription(model);
    if (!description) return undefined;
    return description.split(" - ")[0];
};

export const getModelDescriptionWithoutName = (
    model: ModelPrice,
): string | undefined => {
    if (model.description) return model.description;
    const description = getSourceDescription(model);
    if (!description) return undefined;
    const prefix = model.displayName ? `${model.displayName} - ` : "";
    if (prefix && description.startsWith(prefix)) {
        return description.slice(prefix.length).trim() || undefined;
    }
    const parts = description.split(" - ");
    if (parts.length < 2) return undefined;
    return parts.slice(1).join(" - ").trim() || undefined;
};

export const getModelBrandLogoPath = (
    model: ModelPrice,
): string | undefined => {
    const logoName =
        MODEL_LOGOS[model.name] ??
        (model.brand ? BRAND_LOGOS[model.brand] : undefined);
    return logoName ? `/brand-logos/${logoName}.svg` : undefined;
};

export const getModelModalityIcons = (model: ModelPrice): string[] => {
    const modalities = getModalities(model);
    const icons: string[] = [];

    if (modalities.input.includes("text")) icons.push("💬");
    if (modalities.input.includes("image")) icons.push("👁️");
    if (modalities.input.includes("video")) icons.push("🎬");
    if (modalities.input.includes("audio")) icons.push("🎙️");

    return icons;
};

export const getModelModalityLabel = (model: ModelPrice): string => {
    const modalities = getModalities(model);
    const labels: string[] = [];

    if (modalities.input.includes("text")) labels.push("text");
    if (modalities.input.includes("image")) labels.push("image");
    if (modalities.input.includes("video")) labels.push("video");
    if (modalities.input.includes("audio")) labels.push("audio");

    return labels.length > 0 ? `Input: ${labels.join(", ")}` : "Input";
};

export const getModelCapabilityIcons = (model: ModelPrice): string[] => {
    const icons: string[] = [];

    if (hasReasoning(model)) icons.push("🧠");
    if (hasSearch(model)) icons.push("🔍");
    if (hasCodeExecution(model)) icons.push("💻");

    return icons;
};

export const getModelCapabilityLabel = (model: ModelPrice): string => {
    const labels: string[] = [];

    if (hasReasoning(model)) labels.push("Reasoning");
    if (hasSearch(model)) labels.push("Web search");
    if (hasCodeExecution(model)) labels.push("Code execution");

    return labels.join(", ");
};

const hasCapability = (
    model: ModelPrice,
    capability: ModelCapability,
): boolean =>
    model.capabilities.includes(capability);

export const hasReasoning = (model: ModelPrice): boolean =>
    hasCapability(model, "reasoning");

export const hasSearch = (model: ModelPrice): boolean =>
    hasCapability(model, "web_search");

export const hasCodeExecution = (model: ModelPrice): boolean =>
    hasCapability(model, "code_execution");

export const hasVision = (model: ModelPrice): boolean => {
    const modalities = getModalities(model);
    return modalities.input.includes("image");
};

export const hasAudioInput = (model: ModelPrice): boolean => {
    const modalities = getModalities(model);
    return modalities.input.includes("audio");
};

export const hasAudioOutput = (model: ModelPrice): boolean => {
    const modalities = getModalities(model);
    return modalities.output.includes("audio");
};

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
 * Check if a model requires paid balance only (no tier balance)
 */
export const isPaidOnly = (model: ModelPrice): boolean =>
    model.paidOnly === true;

/**
 * Check if a model is marked as alpha (experimental, potentially unstable)
 */
export const isAlpha = (model: ModelPrice): boolean => model.alpha === true;
