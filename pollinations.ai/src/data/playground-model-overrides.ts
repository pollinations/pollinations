import type { PreviewFormats } from "../ui/play/image-output";
import inventory from "./playground-model-overrides.json";

type PlaygroundModelOverride = {
    reason: string;
    source: string;
    supports4K?: boolean;
    imageFormats?: PreviewFormats;
    decisionQuestionTypes?: string[];
    audioTask?: string;
    audioGroup?: string;
    durationFromInput?: boolean;
    requiresImage?: boolean;
    ratios?: string[];
    defaultRatio?: string;
    soundToggleDefault?: boolean;
    exclusiveReferences?: boolean;
    maxDurationWithReference?: number;
};

const {
    $audioTasks: audioTaskGroups,
    $audioEndpoints: audioEndpoints,
    $performanceFilters: performanceFilters,
    $imageFilters: imageFilters,
    $image4KDimensions: image4KDimensions,
    $uploadLimitsMiB: uploadLimitsMiB,
    $videoFilters: videoFilters,
    $videoDefaultRatios: videoDefaultRatios,
    ...models
} = inventory;

export {
    audioEndpoints,
    audioTaskGroups,
    image4KDimensions,
    imageFilters,
    performanceFilters,
    uploadLimitsMiB,
    videoDefaultRatios,
    videoFilters,
};
export const audioTaskIds = Object.keys(
    audioTaskGroups,
) as (keyof typeof audioTaskGroups)[];

const overrides = new Map<string, PlaygroundModelOverride>(
    Object.entries(models),
);

export function playgroundModelOverride(id: string) {
    return overrides.get(id);
}
