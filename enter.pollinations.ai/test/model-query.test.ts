import { describe, expect, it } from "vitest";
import {
    matchesModelQuery,
    parseModelQuery,
} from "../frontend/src/components/models/model-query.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

function model(overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name: "example/model",
        type: "text",
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

const matches = (candidate: ModelPrice, query: string): boolean =>
    matchesModelQuery(candidate, parseModelQuery(query));

describe("parseModelQuery", () => {
    it("separates case-insensitive filters from text terms", () => {
        expect(
            parseModelQuery(
                "Fast ACCESS:paid owner:Alice id:Alice/Coder type:text capability:tool-calling",
            ),
        ).toEqual({
            terms: ["fast"],
            filters: [
                { key: "access", value: "paid" },
                { key: "owner", value: "alice" },
                { key: "id", value: "alice/coder" },
                { key: "type", value: "text" },
                { key: "capability", value: "tool-calling" },
            ],
        });
    });

    it("keeps unsupported, incomplete, and invalid access filters as text", () => {
        expect(parseModelQuery("unknown:value access: access:any")).toEqual({
            terms: ["unknown:value", "access:", "access:any"],
            filters: [],
        });
    });

    it("keeps additional colons in a filter value", () => {
        expect(parseModelQuery("id:owner/model:variant")).toEqual({
            terms: [],
            filters: [{ key: "id", value: "owner/model:variant" }],
        });
    });
});

describe("matchesModelQuery", () => {
    it.each([
        ["canonical model ID", { name: "alice/quick-coder" }, "quick-coder"],
        ["title", { displayName: "Rapid Illustrator" }, "illustrator"],
        ["description", { description: "Great at restoration" }, "restoration"],
        ["publisher", { brand: "Acme Labs" }, "acme"],
        ["base model", { baseModel: "openai-fast" }, "openai-fast"],
        ["input modality", { inputModalities: ["audio"] }, "audio"],
        ["output modality", { outputModalities: ["video"] }, "video"],
        ["capability", { capabilities: ["web_search"] }, "web search"],
    ])("searches the %s", (_field, overrides, query) => {
        expect(matches(model(overrides as Partial<ModelPrice>), query)).toBe(
            true,
        );
    });

    it("requires every free-text term to match", () => {
        const candidate = model({
            displayName: "Quick Coder",
            brand: "Alice AI",
        });

        expect(matches(candidate, "alice quick")).toBe(true);
        expect(matches(candidate, "alice painter")).toBe(false);
    });

    it.each([
        ["access:free", { free: true }, true],
        ["access:free", { paidOnly: true }, false],
        ["access:paid", { paidOnly: true }, true],
        ["access:paid", {}, false],
        ["access:quest", {}, true],
        ["access:quest", { free: true }, false],
        ["access:quest", { paidOnly: true }, false],
    ])("classifies %s access", (query, overrides, expected) => {
        expect(matches(model(overrides), query)).toBe(expected);
    });

    it("matches an exact public owner login for community models only", () => {
        const community = model({
            name: "PublicOwner/image-model",
            community: true,
            brand: "internal-user-123",
        });

        expect(matches(community, "owner:publicowner")).toBe(true);
        expect(matches(community, "owner:public")).toBe(false);
        expect(
            matches(
                model({ name: "PublicOwner/image-model" }),
                "owner:publicowner",
            ),
        ).toBe(false);
    });

    it("matches an exact canonical ID case-insensitively", () => {
        const candidate = model({ name: "Alice/Quick-Coder" });

        expect(matches(candidate, "id:alice/quick-coder")).toBe(true);
        expect(matches(candidate, "id:quick-coder")).toBe(false);
    });

    it("uses the displayed agent category for type filters", () => {
        const agent = model({ agent: true, type: "text" });

        expect(matches(agent, "type:agent")).toBe(true);
        expect(matches(agent, "type:text")).toBe(false);
        expect(matches(model({ type: "image" }), "type:image")).toBe(true);
    });

    it("matches raw and displayed capabilities with hyphen aliases", () => {
        const candidate = model({
            agent: true,
            capabilities: ["tool_calling", "pollinations_models"],
        });

        expect(matches(candidate, "capability:tool-calling")).toBe(true);
        expect(matches(candidate, "capability:pollinations-models")).toBe(true);
        expect(matches(candidate, "capability:agent")).toBe(true);
        expect(matches(candidate, "capability:reasoning")).toBe(false);
    });

    it("combines text and multiple filters with AND semantics", () => {
        const candidate = model({
            name: "alice/quick-coder",
            displayName: "Quick Coder",
            community: true,
            capabilities: ["reasoning"],
        });

        expect(
            matches(
                candidate,
                "quick owner:alice type:text capability:reasoning access:quest",
            ),
        ).toBe(true);
        expect(
            matches(candidate, "quick owner:alice capability:web-search"),
        ).toBe(false);
        expect(matches(candidate, "access:quest access:paid")).toBe(false);
    });

    it("matches an empty query", () => {
        expect(matches(model(), "   ")).toBe(true);
    });
});
