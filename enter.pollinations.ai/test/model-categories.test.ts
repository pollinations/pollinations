import { describe, expect, it } from "vitest";
import {
    computeCategoryModalities,
    getModelCategoriesFromCatalog,
} from "../frontend/src/components/models/model-categories.ts";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

const catalog = [
    { name: "official-text", category: "text" as const },
    { name: "official-image", category: "image" as const },
    { name: "official-embedding", category: "embedding" as const },
    {
        name: "community-text",
        category: "text" as const,
        community: true,
    },
    {
        name: "community-image",
        category: "image" as const,
        community: true,
    },
    {
        name: "community-embedding",
        category: "embedding" as const,
        community: true,
    },
];

describe("model categories", () => {
    it("separates community models from official modality models", () => {
        const categories = getModelCategoriesFromCatalog(catalog);

        expect(
            categories.map(({ category, label, modality, models }) => ({
                category,
                label,
                modality,
                models: models.map(({ id }) => id),
            })),
        ).toEqual([
            {
                category: "text",
                label: "Text",
                modality: "text",
                models: ["official-text"],
            },
            {
                category: "image",
                label: "Image",
                modality: "images",
                models: ["official-image"],
            },
            {
                category: "embedding",
                label: "Embedding",
                modality: "embeddings",
                models: ["official-embedding"],
            },
            {
                category: "community-text",
                label: "Community Text",
                modality: "text",
                models: ["community-text"],
            },
            {
                category: "community-image",
                label: "Community Image",
                modality: "images",
                models: ["community-image"],
            },
            {
                category: "community-embedding",
                label: "Community Embedding",
                modality: "embeddings",
                models: ["community-embedding"],
            },
        ]);
    });

    it("reports the correct OAuth modality for each community category", () => {
        const categories = getModelCategoriesFromCatalog(catalog);

        expect(
            computeCategoryModalities(["community-text"], categories),
        ).toEqual(["text"]);
        expect(
            computeCategoryModalities(["community-image"], categories),
        ).toEqual(["images"]);
        expect(
            computeCategoryModalities(["community-embedding"], categories),
        ).toEqual(["embeddings"]);
        expect(
            computeCategoryModalities(
                [
                    "official-text",
                    "community-text",
                    "community-image",
                    "community-embedding",
                ],
                categories,
            ),
        ).toEqual(["text", "images", "embeddings"]);
        expect(computeCategoryModalities(null, categories)).toEqual([
            "text",
            "images",
            "embeddings",
        ]);
    });

    it("accepts community category URLs", () => {
        expect(validateModelSearch({ category: "community-text" })).toEqual({
            category: "community-text",
            q: undefined,
            sort: undefined,
            dir: undefined,
        });
        expect(validateModelSearch({ category: "community-image" })).toEqual({
            category: "community-image",
            q: undefined,
            sort: undefined,
            dir: undefined,
        });
        expect(
            validateModelSearch({ category: "community-embedding" }),
        ).toEqual({
            category: "community-embedding",
            q: undefined,
            sort: undefined,
            dir: undefined,
        });
    });
});
