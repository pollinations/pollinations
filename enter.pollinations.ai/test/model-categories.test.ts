import { describe, expect, it } from "vitest";
import {
    getModelCategoriesFromCatalog,
    getSelectedModelCounts,
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

    it("groups official and community selections by modality", () => {
        const categories = getModelCategoriesFromCatalog(catalog);
        const ids = catalog.map(({ name }) => name);
        expect(
            getSelectedModelCounts(
                ["official-text", "community-text", "community-image"],
                ids,
                categories,
            ),
        ).toEqual([
            { modality: "text", label: "Text", count: 2 },
            { modality: "images", label: "Image", count: 1 },
        ]);
        expect(
            getSelectedModelCounts(["community-agent"], ids, categories),
        ).toEqual([{ modality: "text", label: "Text", count: 1 }]);
    });

    it("accepts categories independently of the model query", () => {
        expect(validateModelSearch({})).toEqual({
            category: undefined,
            q: undefined,
            agentQ: undefined,
            mcpQ: undefined,
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
        expect(validateModelSearch({ category: "image" })).toEqual({
            category: "image",
            q: undefined,
            agentQ: undefined,
            mcpQ: undefined,
            sort: undefined,
        });
        expect(
            validateModelSearch({
                category: "agent",
                q: "source:community",
                agentQ: "capability:tool-calling",
                mcpQ: "github",
            }),
        ).toEqual({
            category: "agent",
            q: "source:community",
            agentQ: "capability:tool-calling",
            mcpQ: "github",
            sort: undefined,
        });
    });

    it("accepts model sort options and ignores obsolete values", () => {
        expect(validateModelSearch({ sort: "publisher" })).toEqual({
            category: undefined,
            q: undefined,
            agentQ: undefined,
            mcpQ: undefined,
            sort: "publisher",
        });
        expect(validateModelSearch({ sort: "title-desc" }).sort).toBe(
            "title-desc",
        );
        expect(validateModelSearch({ sort: "oldest" }).sort).toBeUndefined();
        expect(validateModelSearch({ sort: "publisher-desc" }).sort).toBe(
            "publisher-desc",
        );
        expect(
            validateModelSearch({ sort: "brand-desc" }).sort,
        ).toBeUndefined();
        expect(validateModelSearch({ sort: "recommended" })).toEqual({
            category: undefined,
            q: undefined,
            agentQ: undefined,
            mcpQ: undefined,
            sort: undefined,
        });
        expect(validateModelSearch({ sort: "newest" })).toEqual({
            category: undefined,
            q: undefined,
            agentQ: undefined,
            mcpQ: undefined,
            sort: "newest",
        });
    });

    it("trims model search queries and drops whitespace-only values", () => {
        expect(validateModelSearch({ q: "  flux  " }).q).toBe("flux");
        expect(validateModelSearch({ q: "   " }).q).toBeUndefined();
        expect(validateModelSearch({ q: " source:community " }).q).toBe(
            "source:community",
        );
        expect(
            validateModelSearch({ agentQ: " capability:agent ", mcpQ: "  " }),
        ).toMatchObject({ agentQ: "capability:agent", mcpQ: undefined });
    });
});

it("counts only selected offered models, once per modality", () => {
    const categories = getModelCategoriesFromCatalog(catalog);
    const counts = getSelectedModelCounts(
        ["official-text", "official-image"],
        ["official-text"],
        categories,
    );
    expect(counts).toEqual([{ modality: "text", label: "Text", count: 1 }]);
    expect(getSelectedModelCounts([], ["official-text"], categories)).toEqual(
        [],
    );
});
