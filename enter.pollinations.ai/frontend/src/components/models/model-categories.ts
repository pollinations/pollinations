import type { ModelCategory } from "./types.ts";

/** Every model has one of these categories; API keys are scoped by them. */
export const MODEL_CATEGORY_ORDER: ModelCategory[] = [
    "text",
    "decision",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
];

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
    text: "Text",
    decision: "Decision",
    image: "Image",
    video: "Video",
    "3d": "3D",
    audio: "Audio",
    realtime: "Realtime",
    embedding: "Embedding",
};
