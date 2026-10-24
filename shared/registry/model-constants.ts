// Shared model vocabulary, kept free of catalog access: schema modules (and
// the code-agent bundle) validate against these lists without ever loading
// the per-model files.

export const MODEL_CATEGORIES = [
    "text",
    "image",
    "audio",
    "video",
    "3d",
    "embedding",
    "realtime",
    "decision",
] as const;

export type Category = (typeof MODEL_CATEGORIES)[number];

export const MODEL_INPUT_MODALITIES = [
    "text",
    "image",
    "audio",
    "video",
] as const;

export type ModelInputModality = (typeof MODEL_INPUT_MODALITIES)[number];

export const MODEL_OUTPUT_MODALITIES = [
    "text",
    "image",
    "audio",
    "video",
    "embedding",
    "3d",
] as const;

export type ModelOutputModality = (typeof MODEL_OUTPUT_MODALITIES)[number];

export const PRICE_UNITS = ["megapixel", "token", "byte"] as const;

export const VIDEO_CAPABILITIES = [
    "start_frame",
    "end_frame",
    "keyframes",
    "reference_images",
    "reference_videos",
    "reference_audios",
    "audio_output",
] as const;

export type VideoCapability = (typeof VIDEO_CAPABILITIES)[number];
