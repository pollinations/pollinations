import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { Category } from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { getModelDisplayName } from "./model-utils.ts";

export type ModelCategoryLabel =
    | "Text"
    | "Image"
    | "Video"
    | "Audio"
    | "Embedding";
export type ModelCategoryModel = { id: string; label: string };
export type ModelCategoryGroup = {
    category: Category;
    label: ModelCategoryLabel;
    modality: "text" | "images" | "video" | "audio" | "embeddings";
    models: ModelCategoryModel[];
};

const CATEGORY_ORDER: Category[] = [
    "text",
    "image",
    "video",
    "audio",
    "embedding",
];

const CATEGORY_LABELS: Record<Category, ModelCategoryLabel> = {
    text: "Text",
    image: "Image",
    video: "Video",
    audio: "Audio",
    embedding: "Embedding",
};

const CATEGORY_MODALITIES: Record<
    ModelCategoryLabel,
    ModelCategoryGroup["modality"]
> = {
    Text: "text",
    Image: "images",
    Video: "video",
    Audio: "audio",
    Embedding: "embeddings",
};

const allRegistryEntries = [
    ...Object.entries(TEXT_SERVICES),
    ...Object.entries(IMAGE_SERVICES),
    ...Object.entries(AUDIO_SERVICES),
    ...Object.entries(EMBEDDING_SERVICES),
] as Array<[string, { category: Category }]>;

export const MODEL_CATEGORIES: ModelCategoryGroup[] = CATEGORY_ORDER.map(
    (category) => {
        const label = CATEGORY_LABELS[category];
        const models = allRegistryEntries
            .filter(([, config]) => config.category === category)
            .map(([id]) => ({
                id,
                label: getModelDisplayName(id),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        return {
            category,
            label,
            modality: CATEGORY_MODALITIES[label],
            models,
        };
    },
);

const getCategoryModelIds = (category: Category): string[] =>
    (
        MODEL_CATEGORIES.find((group) => group.category === category)?.models ??
        []
    ).map((model) => model.id);

export const textModelIds = getCategoryModelIds("text");

export const imageModelIds = getCategoryModelIds("image");

export const videoModelIds = getCategoryModelIds("video");

export const audioModelIds = getCategoryModelIds("audio");

export const embeddingModelIds = getCategoryModelIds("embedding");

export function computeCategoryModalities(
    allowedModels: string[] | null,
): ModelCategoryGroup["modality"][] {
    if (allowedModels === null) {
        return MODEL_CATEGORIES.map(({ modality }) => modality);
    }

    const selected = new Set(allowedModels);
    return MODEL_CATEGORIES.filter(({ models }) =>
        models.some(({ id }) => selected.has(id)),
    ).map(({ modality }) => modality);
}
