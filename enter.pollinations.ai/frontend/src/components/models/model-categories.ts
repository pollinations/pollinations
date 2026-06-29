import {
    type ApiModelInfo,
    getCatalogCategory,
    getCatalogDisplayName,
    getCatalogModelId,
} from "./model-catalog.ts";
import type { ModelCategory } from "./types.ts";

export type ModelCategoryLabel =
    | "Text"
    | "Image"
    | "Video"
    | "3D"
    | "Audio"
    | "Realtime"
    | "Embedding";
export type ModelCategoryModel = { id: string; label: string };
export type ModelCategoryGroup = {
    category: ModelCategory;
    label: ModelCategoryLabel;
    modality:
        | "text"
        | "images"
        | "video"
        | "3d"
        | "audio"
        | "realtime"
        | "embeddings";
    models: ModelCategoryModel[];
};

const CATEGORY_ORDER: ModelCategory[] = [
    "text",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
];

const CATEGORY_LABELS: Record<ModelCategory, ModelCategoryLabel> = {
    text: "Text",
    image: "Image",
    video: "Video",
    "3d": "3D",
    audio: "Audio",
    realtime: "Realtime",
    embedding: "Embedding",
};

const CATEGORY_MODALITIES: Record<
    ModelCategoryLabel,
    ModelCategoryGroup["modality"]
> = {
    Text: "text",
    Image: "images",
    Video: "video",
    "3D": "3d",
    Audio: "audio",
    Realtime: "realtime",
    Embedding: "embeddings",
};

const ALL_MODALITIES: ModelCategoryGroup["modality"][] = [
    "text",
    "images",
    "video",
    "3d",
    "audio",
    "realtime",
    "embeddings",
];

export function getModelCategoriesFromCatalog(
    models: ApiModelInfo[],
): ModelCategoryGroup[] {
    return CATEGORY_ORDER.map((category) => {
        const label = CATEGORY_LABELS[category];
        const categoryModels = models
            .filter((model) => getCatalogCategory(model) === category)
            .map((model) => {
                const id = getCatalogModelId(model);
                return {
                    id,
                    label: getCatalogDisplayName(model, id),
                };
            })
            .filter((model) => model.id)
            .sort((a, b) => a.label.localeCompare(b.label));

        return {
            category,
            label,
            modality: CATEGORY_MODALITIES[label],
            models: categoryModels,
        };
    }).filter(({ models }) => models.length > 0);
}

export function computeCategoryModalities(
    allowedModels: string[] | null,
    categories: ModelCategoryGroup[] = [],
): ModelCategoryGroup["modality"][] {
    if (allowedModels === null) {
        return categories.length > 0
            ? categories.map(({ modality }) => modality)
            : ALL_MODALITIES;
    }

    const selected = new Set(allowedModels);
    const modalities = categories
        .filter(({ models }) => models.some(({ id }) => selected.has(id)))
        .map(({ modality }) => modality);
    return modalities;
}
