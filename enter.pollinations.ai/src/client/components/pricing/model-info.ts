/**
 * Model metadata and information utilities
 */

import type { Modalities } from "./types.ts";
import { getServiceDefinition, ServiceId } from "@shared/registry/registry.ts";

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

export const isPersona = (modelName: string): boolean => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.persona === true;
};

export const getTextModelId = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.modelId as string | undefined;
};

export const getImageModelId = (modelName: string): string | undefined => {
    const service = getServiceDefinition(modelName as ServiceId);
    return service?.modelId as string | undefined;
};
