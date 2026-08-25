import { describe, expect, it } from "vitest";
import { modelMatchesFilters, parseModelFilters } from "./model-filters.ts";

describe("parseModelFilters", () => {
    it("parses empty query", () => {
        const f = parseModelFilters("");
        expect(f.freeText).toEqual([]);
        expect(f.access).toBeNull();
        expect(f.owner).toBeNull();
    });

    it("parses free text", () => {
        const f = parseModelFilters("hello world");
        expect(f.freeText).toEqual(["hello", "world"]);
    });

    it("parses access:free", () => {
        const f = parseModelFilters("access:free");
        expect(f.access).toBe("free");
        expect(f.freeText).toEqual([]);
    });

    it("parses access:paid", () => {
        const f = parseModelFilters("access:paid");
        expect(f.access).toBe("paid");
    });

    it("parses owner:alice", () => {
        const f = parseModelFilters("owner:alice");
        expect(f.owner).toBe("alice");
    });

    it("parses id:gpt", () => {
        const f = parseModelFilters("id:gpt");
        expect(f.id).toBe("gpt");
    });

    it("parses type:image", () => {
        const f = parseModelFilters("type:image");
        expect(f.type).toBe("image");
    });

    it("parses capability:reasoning", () => {
        const f = parseModelFilters("capability:reasoning");
        expect(f.capability).toBe("reasoning");
    });

    it("combines filters with free text", () => {
        const f = parseModelFilters("access:free flux fast");
        expect(f.access).toBe("free");
        expect(f.freeText).toEqual(["flux", "fast"]);
    });

    it("ignores unknown filter keys as free text", () => {
        const f = parseModelFilters("unknown:value flux");
        expect(f.access).toBeNull();
        expect(f.freeText).toContain("unknown:value");
        expect(f.freeText).toContain("flux");
    });
});

describe("modelMatchesFilters", () => {
    const baseModel = {
        name: "openai/gpt-4o",
        type: "text" as const,
        capabilities: ["tool_calling" as const],
        paidOnly: false,
        community: false,
        brand: "OpenAI",
        description: "Fast text model",
    };

    it("matches all when no filters", () => {
        const f = parseModelFilters("");
        expect(modelMatchesFilters(baseModel, f)).toBe(true);
    });

    it("filters by access:paid", () => {
        const f = parseModelFilters("access:paid");
        expect(modelMatchesFilters(baseModel, f)).toBe(false);
        expect(modelMatchesFilters({ ...baseModel, paidOnly: true }, f)).toBe(
            true,
        );
    });

    it("filters by access:free", () => {
        const f = parseModelFilters("access:free");
        expect(modelMatchesFilters(baseModel, f)).toBe(true);
        expect(modelMatchesFilters({ ...baseModel, paidOnly: true }, f)).toBe(
            false,
        );
    });

    it("filters by type", () => {
        const f = parseModelFilters("type:image");
        expect(modelMatchesFilters(baseModel, f)).toBe(false);
        expect(modelMatchesFilters({ ...baseModel, type: "image" }, f)).toBe(
            true,
        );
    });

    it("filters by owner on community models", () => {
        const communityModel = {
            ...baseModel,
            name: "alice/my-model",
            community: true,
        };
        const f = parseModelFilters("owner:alice");
        expect(modelMatchesFilters(communityModel, f)).toBe(true);
        expect(
            modelMatchesFilters({ ...communityModel, name: "bob/model" }, f),
        ).toBe(false);
    });

    it("rejects owner filter on non-community models", () => {
        const f = parseModelFilters("owner:openai");
        expect(modelMatchesFilters(baseModel, f)).toBe(false);
    });

    it("filters by id", () => {
        const f = parseModelFilters("id:gpt");
        expect(modelMatchesFilters(baseModel, f)).toBe(true);
        expect(
            modelMatchesFilters({ ...baseModel, name: "claude/sonnet" }, f),
        ).toBe(false);
    });

    it("filters by capability", () => {
        const f = parseModelFilters("capability:tool");
        expect(modelMatchesFilters(baseModel, f)).toBe(true);
        expect(
            modelMatchesFilters(
                { ...baseModel, capabilities: ["reasoning"] },
                f,
            ),
        ).toBe(false);
    });

    it("combines free text with filters", () => {
        const f = parseModelFilters("access:free flux");
        expect(
            modelMatchesFilters(
                { ...baseModel, description: "Fast flux model" },
                f,
            ),
        ).toBe(true);
        expect(
            modelMatchesFilters(
                { ...baseModel, description: "Claude model" },
                f,
            ),
        ).toBe(false);
    });
});
