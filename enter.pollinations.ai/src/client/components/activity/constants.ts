import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { getModelDisplayName } from "../keys/model-utils.ts";

export type ModelModality = "text" | "image" | "audio";

export const ALL_MODELS = [
    ...Object.keys(TEXT_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "text" as const,
    })),
    ...Object.keys(IMAGE_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "image" as const,
    })),
    ...Object.keys(AUDIO_SERVICES).map((id) => ({
        id,
        label: getModelDisplayName(id),
        type: "audio" as const,
    })),
];

export const MODALITY_META: Record<
    ModelModality,
    { emoji: string; label: string }
> = {
    text: { emoji: "💬", label: "text" },
    image: { emoji: "🖼️", label: "image" },
    audio: { emoji: "🎵", label: "audio" },
};
