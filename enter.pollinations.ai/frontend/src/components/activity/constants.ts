export type ModelModality =
    | "text"
    | "image"
    | "video"
    | "audio"
    | "embedding"
    | "realtime";

export const MODEL_MODALITIES: ModelModality[] = [
    "text",
    "image",
    "video",
    "audio",
    "embedding",
    "realtime",
];

export const MODALITY_META: Record<
    ModelModality,
    { emoji: string; label: string }
> = {
    text: { emoji: "💬", label: "text" },
    image: { emoji: "🖼️", label: "image" },
    video: { emoji: "🎬", label: "video" },
    audio: { emoji: "🎵", label: "audio" },
    embedding: { emoji: "🔎", label: "embedding" },
    realtime: { emoji: "🎙️", label: "realtime" },
};
