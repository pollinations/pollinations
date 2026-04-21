import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";

export const textModelIds = Object.keys(TEXT_SERVICES);

export const imageModelIds = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("image"),
    )
    .map(([id]) => id);

export const videoModelIds = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("video"),
    )
    .map(([id]) => id);

export const audioModelIds = Object.keys(AUDIO_SERVICES);

const CATEGORY_MODALITIES = [
    { modality: "text", modelIds: textModelIds },
    { modality: "images", modelIds: imageModelIds },
    { modality: "audio", modelIds: audioModelIds },
    { modality: "video", modelIds: videoModelIds },
] as const;

export function computeCategoryModalities(
    allowedModels: string[] | null,
): Array<(typeof CATEGORY_MODALITIES)[number]["modality"]> {
    if (allowedModels === null) {
        return CATEGORY_MODALITIES.map(({ modality }) => modality);
    }

    const selected = new Set(allowedModels);
    return CATEGORY_MODALITIES.filter(({ modelIds }) =>
        modelIds.some((id) => selected.has(id)),
    ).map(({ modality }) => modality);
}
