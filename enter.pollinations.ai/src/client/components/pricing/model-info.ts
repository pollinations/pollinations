/**
 * Model metadata and information utilities
 */

import {
    getModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import type { Modalities } from "./types.ts";

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

/**
 * Get a human-readable display name for a model (e.g., "OpenAI GPT-5 Mini")
 * Extracts the first part of the description before " - "
 */
export const getModelDisplayName = (modelName: string): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    const description = service?.description;
    if (!description) return undefined;
    // Extract first part before " - " (e.g., "OpenAI GPT-5 Mini" from "OpenAI GPT-5 Mini - Fast & Balanced")
    return description.split(" - ")[0];
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

export const hasVideoInput = (modelName: string): boolean => {
    const modalities = getModalities(modelName);
    return modalities.input.includes("video");
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

export const getTextModelId = (modelName: string): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.modelId as string | undefined;
};

export const getImageModelId = (modelName: string): string | undefined => {
    const service = getModelDefinition(modelName as ModelName);
    return service?.modelId as string | undefined;
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
