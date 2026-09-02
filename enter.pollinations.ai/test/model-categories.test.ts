import { describe, expect, it } from "vitest";
import {
    computeCategoryModalities,
    getModelCategoriesFromCatalog,
} from "../frontend/src/components/models/model-categories.ts";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

const catalog = [
    { name: "official-text", category: "text" as const },
    { name: "official-image", category: "image" as const },
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
        name: "community-agent",
        category: "text" as const,
        community: true,
        agent: true,
    },
];

describe("model categories", () => {
    it("separates community text and image models from official models", () => {
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
                category: "community-agent",
                label: "Community Agents",
                modality: "text",
                models: ["community-agent"],
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
            computeCategoryModalities(["community-agent"], categories),
        ).toEqual(["text"]);
        expect(
            computeCategoryModalities(
                ["official-text", "community-text", "community-image"],
                categories,
            ),
        ).toEqual(["text", "images"]);
        expect(computeCategoryModalities(null, categories)).toEqual([
            "text",
            "images",
        ]);
    });

    it("defaults to community models and accepts categories independently", () => {
        expect(validateModelSearch({ scope: "community" })).toEqual({
            scope: undefined,
            category: undefined,
            q: undefined,
            sort: undefined,
        });
        for (const category of [
            "image",
            "video",
            "audio",
            "embedding",
            "agent",
            "mcp",
        ] as const) {
            expect(validateModelSearch({ category }).category).toBe(category);
        }
        expect(
            validateModelSearch({ scope: "pollinations", category: "image" }),
        ).toEqual({
            scope: "pollinations",
            category: "image",
            q: undefined,
            sort: undefined,
        });
    });

    it("accepts model sort options and ignores obsolete values", () => {
        expect(validateModelSearch({ sort: "author" })).toEqual({
            scope: undefined,
            category: undefined,
            q: undefined,
            sort: "author",
        });
        expect(validateModelSearch({ sort: "title-desc" }).sort).toBe(
            "title-desc",
        );
        expect(validateModelSearch({ sort: "oldest" }).sort).toBeUndefined();
        expect(validateModelSearch({ sort: "author-desc" }).sort).toBe(
            "author-desc",
        );
        expect(
            validateModelSearch({ sort: "brand-desc" }).sort,
        ).toBeUndefined();
        expect(validateModelSearch({ sort: "recommended" })).toEqual({
            scope: undefined,
            category: undefined,
            q: undefined,
            sort: undefined,
        });
        expect(validateModelSearch({ sort: "newest" })).toEqual({
            scope: undefined,
            category: undefined,
            q: undefined,
            sort: "newest",
        });
    });

    it("trims model search queries and drops whitespace-only values", () => {
        expect(validateModelSearch({ q: "  flux  " }).q).toBe("flux");
        expect(validateModelSearch({ q: "   " }).q).toBeUndefined();
    });
});
