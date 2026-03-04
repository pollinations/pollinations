/**
 * Image/video model definitions derived from the shared registry.
 * Single source of truth: shared/registry/image.ts
 */
import { IMAGE_SERVICES } from "../../shared/registry/image";
import type { ServiceDefinition } from "../../shared/registry/registry";

export interface TestModel {
    id: string;
    modelId: string;
    inputModalities: string[];
    outputModalities: string[];
    paidOnly?: boolean;
    hidden?: boolean;
    alpha?: boolean;
    provider: string;
}

function toTestModels(outputType: "image" | "video"): TestModel[] {
    return Object.entries(IMAGE_SERVICES)
        .filter(([, s]) => {
            const svc = s as ServiceDefinition;
            return svc.outputModalities?.includes(outputType);
        })
        .map(([id, s]) => {
            const svc = s as ServiceDefinition;
            return {
                id,
                modelId: svc.modelId,
                inputModalities: [...(svc.inputModalities ?? [])],
                outputModalities: [...(svc.outputModalities ?? [])],
                ...(svc.paidOnly ? { paidOnly: true } : {}),
                ...(svc.hidden ? { hidden: true } : {}),
                ...(svc.alpha ? { alpha: true } : {}),
                provider: svc.provider,
            };
        });
}

export const IMAGE_MODELS: TestModel[] = toTestModels("image");
export const VIDEO_MODELS: TestModel[] = toTestModels("video");
