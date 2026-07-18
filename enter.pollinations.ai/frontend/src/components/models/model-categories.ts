import {
    type ApiModelInfo,
    getCatalogCategory,
    getCatalogDisplayName,
    getCatalogModelId,
} from "./model-catalog.ts";
import type { ModelCategory, ModelDisplayCategory } from "./types.ts";

export type ModelCategoryLabel =
    | "Text"
    | "Image"
    | "Video"
    | "3D"
    | "Audio"
    | "Realtime"
    | "Embedding"
    | "Community Text"
    | "Community Image"
    | "Community Audio"
    | "Community Embedding";
export type ModelCategoryModel = { id: string; label: string };
export type ModelCategoryGroup = {
    category: ModelDisplayCategory;
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

const CATEGORY_ORDER: ModelDisplayCategory[] = [
    "text",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
    "community-text",
    "community-image",
    "community-audio",
    "community-embedding",
];

const CATEGORY_LABELS: Record<ModelDisplayCategory, ModelCategoryLabel> = {
    text: "Text",
    image: "Image",
    video: "Video",
    "3d": "3D",
    audio: "Audio",
    realtime: "Realtime",
    embedding: "Embedding",
    "community-text": "Community Text",
    "community-image": "Community Image",
    "community-audio": "Community Audio",
    "community-embedding": "Community Embedding",
};

const CATEGORY_MODALITIES: Record<
    ModelDisplayCategory,
    ModelCategoryGroup["modality"]
> = {
    text: "text",
    image: "images",
    video: "video",
    "3d": "3d",
    audio: "audio",
    realtime: "realtime",
    embedding: "embeddings",
    "community-text": "text",
    "community-image": "images",
    "community-audio": "audio",
    "community-embedding": "embeddings",
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

export function getModelDisplayCategory(
    category: ModelCategory,
    community = false,
): ModelDisplayCategory {
    if (
        community &&
        (category === "text" ||
            category === "image" ||
            category === "audio" ||
            category === "embedding")
    ) {
        return `community-${category}`;
    }
    return category;
}

export function getModelCategoriesFromCatalog(
    models: ApiModelInfo[],
): ModelCategoryGroup[] {
    return CATEGORY_ORDER.map((category) => {
        const label = CATEGORY_LABELS[category];
        const categoryModels = models
            .filter(
                (model) =>
                    getModelDisplayCategory(
                        getCatalogCategory(model),
                        model.community,
                    ) === category,
            )
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
            modality: CATEGORY_MODALITIES[category],
            models: categoryModels,
        };
    }).filter(({ models }) => models.length > 0);
}

export function computeCategoryModalities(
    allowedModels: string[] | null,
    categories: ModelCategoryGroup[] = [],
): ModelCategoryGroup["modality"][] {
    if (categories.length === 0) {
        return allowedModels === null ? ALL_MODALITIES : [];
    }

    const selected = allowedModels === null ? null : new Set(allowedModels);
    const modalities = categories
        .filter(
            ({ models }) =>
                selected === null || models.some(({ id }) => selected.has(id)),
        )
        .map(({ modality }) => modality);
    return [...new Set(modalities)];
}
