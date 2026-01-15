/**
 * Model metadata and information utilities
 */

import {
    getServiceDefinition,
    type ServiceId,
} from "@shared/registry/registry.ts";
import type { Modalities } from "./types.ts";

export const getModalities = (modelName: string): Modalities => {
    const service = getServiceDefinition(modelName as ServiceId);
    return {
        input: service?.inputModalities || ["text"],
        output: service?.outputModalities || ["text"],
    };
};

export const getModelDescription = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.description;
};

/**
 * Get a human-readable display name for a model (e.g., "OpenAI GPT-5 Mini")
 * Extracts the first part of the description before " - "
 */
export const getModelDisplayName = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    const description = service?.description;
    if (!description) return undefined;
    // Extract first part before " - " (e.g., "OpenAI GPT-5 Mini" from "OpenAI GPT-5 Mini - Fast & Balanced")
    return description.split(" - ")[0];
};

export const hasReasoning = (modelName: string): boolean => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.reasoning === true;
};

export const hasSearch = (modelName: string): boolean => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.search === true;
};

export const hasCodeExecution = (modelName: string): boolean => {
    const service = getServiceDefinition(modelName as ServiceId);
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
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.persona === true;
};

/**
 * Check if a model is "new" (added within the last 14 days)
 */
export const isNewModel = (modelName: string): boolean => {
    const service = getServiceDefinition(modelName as ServiceId);
    if (!service?.cost?.[0]?.date) return false;
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return service.cost[0].date > fourteenDaysAgo;
};

export const getTextModelId = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.modelId as string | undefined;
};

export const getImageModelId = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.modelId as string | undefined;
};
