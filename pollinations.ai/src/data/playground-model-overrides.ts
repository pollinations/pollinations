import type { PreviewFormats } from "../ui/play/image-output";
import inventory from "./playground-model-overrides.json";

// Play can preview these optional fields before the catalog SDK release.
export type AudioCatalogMetadata = {
    max_reference_audios?: number;
    audio_input_constraints?: {
        min_seconds?: number;
        max_seconds?: number;
        max_total_seconds?: number;
        requires_reference_visual?: boolean;
    };
    transcription_options?: readonly string[];
};

type PlaygroundModelOverride = {
    reason: string;
    source: string;
    supports4K?: boolean;
    imageFormats?: PreviewFormats;
    decisionQuestionTypes?: string[];
    audioTask?: string;
    audioCatalog?: AudioCatalogMetadata;
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

export function playgroundAudioMetadata(
    id: string,
    catalog: AudioCatalogMetadata,
) {
    const preview = playgroundModelOverride(id)?.audioCatalog;
    return {
        maxReferenceAudios:
            catalog.max_reference_audios ?? preview?.max_reference_audios,
        audioInputConstraints:
            catalog.audio_input_constraints ?? preview?.audio_input_constraints,
        transcriptionOptions:
            catalog.transcription_options ?? preview?.transcription_options,
    };
}
