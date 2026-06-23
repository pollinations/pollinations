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
    Ideogram: "ideogram",
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
    "Stability AI": "stability",
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

export type InputModality = "text" | "image" | "video" | "audio";

export const getModelInputModalities = (model: ModelPrice): InputModality[] => {
    const modalities = getModalities(model);
    const keys: InputModality[] = [];

    if (modalities.input.includes("text")) keys.push("text");
    if (modalities.input.includes("image")) keys.push("image");
    if (modalities.input.includes("video")) keys.push("video");
    if (modalities.input.includes("audio")) keys.push("audio");

    return keys;
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

export type DisplayCapability = "reasoning" | "web_search" | "code_execution";

export const getModelCapabilities = (
    model: ModelPrice,
): DisplayCapability[] => {
    const keys: DisplayCapability[] = [];

    if (hasReasoning(model)) keys.push("reasoning");
    if (hasSearch(model)) keys.push("web_search");
    if (hasCodeExecution(model)) keys.push("code_execution");

    return keys;
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
): boolean => model.capabilities.includes(capability);

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
