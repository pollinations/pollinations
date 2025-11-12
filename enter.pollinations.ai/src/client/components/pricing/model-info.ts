/**
 * Model metadata and information utilities
 */

import { TEXT_SERVICES } from "../../../../../shared/registry/text.ts";
import { IMAGE_SERVICES } from "../../../../../shared/registry/image.ts";
import type { Modalities } from "./types.ts";

export const getModalities = (modelName: string, modelType: string): Modalities => {
    if (modelType === "text") {
        const service = TEXT_SERVICES[modelName as keyof typeof TEXT_SERVICES] as any;
        return {
            input: service?.input_modalities || ["text"],
            output: service?.output_modalities || ["text"]
        };
    } else {
        const service = IMAGE_SERVICES[modelName as keyof typeof IMAGE_SERVICES] as any;
        return {
            input: service?.input_modalities || ["text"],
            output: service?.output_modalities || ["image"]
        };
    }
};

export const getModelDescription = (modelName: string, modelType: string): string | undefined => {
    if (modelType === "image") {
        const service = IMAGE_SERVICES[modelName as keyof typeof IMAGE_SERVICES] as any;
        return service?.description;
    } else {
        const service = TEXT_SERVICES[modelName as keyof typeof TEXT_SERVICES] as any;
        return service?.description;
    }
};

export const hasReasoning = (modelName: string, modelType: string): boolean => {
    if (modelType !== "text") return false;
    return (TEXT_SERVICES[modelName as keyof typeof TEXT_SERVICES] as any)?.reasoning === true;
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
    return (TEXT_SERVICES[modelName as keyof typeof TEXT_SERVICES] as any)?.persona === true;
};

export const getRealModelId = (modelName: string, modelType: string): string | undefined => {
    if (modelType === "text") {
        return (TEXT_SERVICES[modelName as keyof typeof TEXT_SERVICES] as any)?.modelId;
    } else {
        return (IMAGE_SERVICES[modelName as keyof typeof IMAGE_SERVICES] as any)?.modelId;
    }
};
