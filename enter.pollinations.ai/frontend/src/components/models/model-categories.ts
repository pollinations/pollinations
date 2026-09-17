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
    | "Community Agents";
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
    "community-agent",
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
    "community-agent": "Community Agents",
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
    "community-agent": "text",
};

export function getModelDisplayCategory(
    category: ModelCategory,
    community = false,
    agent = false,
): ModelDisplayCategory {
    if (community && agent) return "community-agent";
    if (community && (category === "text" || category === "image")) {
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
                        model.agent,
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

export function getSelectedModelCounts(
    selectedIds: string[] | null,
    requestedIds: string[],
    categories: ModelCategoryGroup[],
): { modality: string; label: string; count: number }[] {
    const selected = new Set(
        requestedIds.filter(
            (id) => selectedIds === null || selectedIds.includes(id),
        ),
    );
    const counts = new Map<
        string,
        { modality: string; label: string; count: number }
    >();
    for (const group of categories) {
        const category =
            group.modality === "images"
                ? "image"
                : group.modality === "embeddings"
                  ? "embedding"
                  : group.modality;
        for (const { id } of group.models) {
            if (!selected.delete(id)) continue;
            const summary = counts.get(group.modality) ?? {
                modality: group.modality,
                label: CATEGORY_LABELS[category],
                count: 0,
            };
            summary.count += 1;
            counts.set(group.modality, summary);
        }
    }
    if (selected.size)
        counts.set("other", {
            modality: "other",
            label: "Other",
            count: selected.size,
        });
    return [...counts.values()];
}
