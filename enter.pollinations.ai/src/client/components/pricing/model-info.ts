/**
 * Model metadata and information utilities
 */

import { TEXT_SERVICES } from "../../../../../shared/registry/text.ts";
import { IMAGE_SERVICES } from "../../../../../shared/registry/image.ts";
import type { Modalities } from "./types.ts";

// Helper types for cleaner service lookups
type TextServiceName = keyof typeof TEXT_SERVICES;
type ImageServiceName = keyof typeof IMAGE_SERVICES;

export const getModalities = (modelName: string, modelType: string): Modalities => {
    if (modelType === "text") {
        const service = TEXT_SERVICES[modelName as TextServiceName] as any;
        return {
            input: service?.input_modalities || ["text"],
            output: service?.output_modalities || ["text"]
        };
    } else {
        const service = IMAGE_SERVICES[modelName as ImageServiceName] as any;
        return {
            input: service?.input_modalities || ["text"],
            output: service?.output_modalities || ["image"]
        };
    }
};

export const getModelDescription = (modelName: string, modelType: string): string | undefined => {
    if (modelType === "image") {
        const service = IMAGE_SERVICES[modelName as ImageServiceName] as any;
        return service?.description;
    } else {
        const service = TEXT_SERVICES[modelName as TextServiceName] as any;
        return service?.description;
    }
};

export const hasReasoning = (modelName: string, modelType: string): boolean => {
    if (modelType !== "text") return false;
    const service = TEXT_SERVICES[modelName as TextServiceName] as any;
    return service?.reasoning === true;
};

export const hasVision = (modelName: string, modelType: string): boolean => {
    const modalities = getModalities(modelName, modelType);
    return modalities.input.includes("image");
};

export const hasAudioInput = (modelName: string, modelType: string): boolean => {
    const modalities = getModalities(modelName, modelType);
    return modalities.input.includes("audio");
};

export const isPersona = (modelName: string): boolean => {
    const service = TEXT_SERVICES[modelName as TextServiceName] as any;
    return service?.persona === true;
};

export const getTextModelId = (modelName: TextServiceName): string | undefined => {
    const service = TEXT_SERVICES[modelName];
    return service?.modelId as string | undefined;
};

export const getImageModelId = (modelName: ImageServiceName): string | undefined => {
    const service = IMAGE_SERVICES[modelName];
    return service?.modelId as string | undefined;
};
