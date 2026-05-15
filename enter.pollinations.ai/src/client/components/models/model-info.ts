/**
 * Model metadata and information utilities
 */

import {
    getModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import type { Modalities } from "./types.ts";

const BRAND_LOGOS: Record<string, string> = {
    "ACE-Step": "ace-step",
    Alibaba: "alibaba",
    Amazon: "amazon",
    Anthropic: "anthropic",
    AssemblyAI: "assemblyai",
    "Black Forest Labs": "black-forest-labs",
    ByteDance: "bytedance",
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
    "Z.ai": "zai",
    xAI: "xai",
};

const MODEL_LOGOS: Record<string, string> = {};

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
    const description = service?.description;
    if (!description) return undefined;
    return description.split(" - ")[0];
};

export const getModelDescriptionWithoutName = (
    modelName: string,
): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    const description = service?.description;
    if (!description) return undefined;
    const parts = description.split(" - ");
    if (parts.length < 2) return undefined;
    return parts.slice(1).join(" - ").trim() || undefined;
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

    if (modalities.input.includes("text")) labels.push("text");
    if (modalities.input.includes("image")) labels.push("image");
    if (modalities.input.includes("video")) labels.push("video");
    if (modalities.input.includes("audio")) labels.push("audio");

    return labels.length > 0 ? `Input: ${labels.join(", ")}` : "Input";
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
    if (!service?.cost?.[0]?.date) return false;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return service.cost[0].date > thirtyDaysAgo;
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
