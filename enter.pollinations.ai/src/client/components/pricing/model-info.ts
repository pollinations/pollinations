/**
 * Model metadata and information utilities
 */

import {
    getModelDefinition,
    getModelKey,
    type ModelName,
    type ModelProfile,
} from "@shared/registry/registry.ts";
import type { Modalities } from "./types.ts";

export const MODEL_COPY_CURSOR =
    'url(\'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="none"%3E%3Crect x="5" y="5" width="8" height="8" rx="0.75" stroke="%23556370" stroke-width="1.5"/%3E%3Cpath d="M10 5V3.5H3.5V10H5" stroke="%23556370" stroke-width="1.5" stroke-linecap="square"/%3E%3C/svg%3E\') 2 2, pointer';

const BRAND_LOGOS: Record<string, string> = {
    "ACE-Step": "ace-step",
    Alibaba: "alibaba",
    Amazon: "amazon",
    Anthropic: "anthropic",
    "Black Forest Labs": "black-forest-labs",
    ByteDance: "bytedance",
    DeepSeek: "deepseek",
    ElevenLabs: "elevenlabs",
    Google: "google",
    Lightricks: "lightricks",
    MiniMax: "minimax",
    Mistral: "mistral",
    "Moonshot AI": "moonshot",
    OpenAI: "openai",
    Perplexity: "perplexity",
    Pollinations: "pollinations",
    Pruna: "pruna",
    Qwen: "qwen",
    "Z.ai": "zai",
    xAI: "xai",
};

const MODEL_LOGOS: Record<string, string> = {
    midijourney: "pollinations",
    "midijourney-large": "pollinations",
    zimage: "pollinations",
};

export const getModalities = (modelName: string): Modalities => {
    const service = getModelDefinition(modelName as ModelName);
    return {
        input: service?.inputModalities || ["text"],
        output: service?.outputModalities || ["text"],
    };
};

export const getModelDescription = (modelName: string): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.description;
};

export const getModelDisplayName = (modelName: string): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    if (!service) return undefined;
    return service.model;
};

export const getModelProfile = (
    modelName: string,
): ModelProfile | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.profile;
};

export const getModelBrandLogoPath = (
    modelName: string,
): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    const logoName =
        MODEL_LOGOS[modelName] ??
        (service ? BRAND_LOGOS[service.brand] : undefined);
    return logoName ? `/brand-logos/${logoName}.svg` : undefined;
};

export const getModelModalityIcons = (modelName: string): string[] => {
    const modalities = getModalities(modelName);
    const icons: string[] = [];

    if (modalities.input.includes("text")) icons.push("💬");
    if (modalities.input.includes("image")) icons.push("👁️");
    if (modalities.input.includes("video")) icons.push("🎬");
    if (modalities.input.includes("audio")) icons.push("🎙️");

    return icons;
};

export const getModelModalityLabel = (modelName: string): string => {
    const modalities = getModalities(modelName);
    const labels: string[] = [];

    if (modalities.input.includes("text")) labels.push("Text input");
    if (modalities.input.includes("image")) labels.push("Image input");
    if (modalities.input.includes("video")) labels.push("Video input");
    if (modalities.input.includes("audio")) labels.push("Audio input");

    return labels.join(", ");
};

export const getModelCapabilityIcons = (modelName: string): string[] => {
    const icons: string[] = [];

    if (hasReasoning(modelName)) icons.push("🧠");
    if (hasSearch(modelName)) icons.push("🔍");
    if (hasCodeExecution(modelName)) icons.push("💻");

    return icons;
};

export const getModelCapabilityLabel = (modelName: string): string => {
    const labels: string[] = [];

    if (hasReasoning(modelName)) labels.push("Reasoning");
    if (hasSearch(modelName)) labels.push("Web search");
    if (hasCodeExecution(modelName)) labels.push("Code execution");

    return labels.join(", ");
};

export const hasReasoning = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.reasoning === true;
};

export const hasSearch = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.search === true;
};

export const hasCodeExecution = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.codeExecution === true;
};

export const hasVision = (modelName: string): boolean => {
    const modalities = getModalities(modelName);
    return modalities.input.includes("image");
};

export const hasAudioInput = (modelName: string): boolean => {
    const modalities = getModalities(modelName);
    return modalities.input.includes("audio");
};

export const hasAudioOutput = (modelName: string): boolean => {
    const modalities = getModalities(modelName);
    return modalities.output.includes("audio");
};

export const isPersona = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.persona === true;
};

/**
 * Check if a model is "new" (added within the last 30 days)
 */
export const isNewModel = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    if (!service?.introducedAt) return false;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return service.introducedAt > thirtyDaysAgo;
};

export const getTextModelId = (modelName: string): string | undefined => {
    return getModelKey(modelName as ModelName);
};

export const getImageModelId = (modelName: string): string | undefined => {
    return getModelKey(modelName as ModelName);
};

/**
 * Check if a model requires paid balance only (no tier balance)
 */
export const isPaidOnly = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.paidOnly === true;
};

/**
 * Check if a model is marked as alpha (experimental, potentially unstable)
 */
export const isAlpha = (modelName: string): boolean => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.alpha === true;
};
