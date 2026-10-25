import { describe, expect, it } from "vitest";
import { validateModelSearch } from "../frontend/src/components/models/model-search.ts";

describe("model search", () => {
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
