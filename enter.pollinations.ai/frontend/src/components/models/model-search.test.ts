import { describe, expect, it } from "vitest";
import { matchesModelPrice, parseModelSearchQuery } from "./model-search.ts";
import type { ModelPrice } from "./types.ts";

function model(overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name: "test-model",
        type: "text",
        capabilities: [],
        prices: [],
        free: false,
        paidOnly: false,
        ...overrides,
    } as ModelPrice;
}

describe("parseModelSearchQuery", () => {
    it("splits free text", () => {
        expect(parseModelSearchQuery("hello world")).toEqual({
            freeText: ["hello", "world"],
            filters: {},
        });
    });

    it("extracts known filters", () => {
        const { freeText, filters } = parseModelSearchQuery(
            "access:free owner:alice",
        );
        expect(freeText).toEqual([]);
        expect(filters).toEqual({
            access: ["free"],
            owner: ["alice"],
        });
    });

    it("mixes free text and filters", () => {
        const { freeText, filters } = parseModelSearchQuery(
            "vision access:quest capability:reasoning",
        );
        expect(freeText).toEqual(["vision"]);
        expect(filters.access).toEqual(["quest"]);
        expect(filters.capability).toEqual(["reasoning"]);
    });

    it("is case-insensitive for keys and values", () => {
        const { filters } = parseModelSearchQuery("Access:Paid Type:TEXT");
        expect(filters.access).toEqual(["paid"]);
        expect(filters.type).toEqual(["text"]);
    });

    it("treats unknown keys as free text", () => {
        const { freeText, filters } = parseModelSearchQuery("foo:bar hello");
        expect(filters).toEqual({});
        expect(freeText).toEqual(["foo:bar", "hello"]);
    });

    it("handles id filter with model ids", () => {
        const { filters } = parseModelSearchQuery("id:openai-fast");
        expect(filters.id).toEqual(["openai-fast"]);
    });
});

describe("matchesModelPrice", () => {
    it("matches free text against name, brand and description", () => {
        const m = model({
            name: "openai-fast",
            brand: "OpenAI",
            description: "Fast reasoning model",
        });
        expect(matchesModelPrice(m, "openai")).toBe(true);
        expect(matchesModelPrice(m, "reasoning")).toBe(true);
        expect(matchesModelPrice(m, "anthropic")).toBe(false);
    });

    it("matches base model and modalities", () => {
        const m = model({
            name: "vision-model",
            baseModel: "gpt-4o",
            inputModalities: ["image", "text"],
        });
        expect(matchesModelPrice(m, "gpt-4o")).toBe(true);
        expect(matchesModelPrice(m, "image")).toBe(true);
    });

    it("filters by access", () => {
        const free = model({ name: "a", free: true });
        const paid = model({ name: "b", paidOnly: true });
        const quest = model({ name: "c" });
        expect(matchesModelPrice(free, "access:free")).toBe(true);
        expect(matchesModelPrice(free, "access:paid")).toBe(false);
        expect(matchesModelPrice(paid, "access:paid")).toBe(true);
        expect(matchesModelPrice(quest, "access:quest")).toBe(true);
    });

    it("filters by owner", () => {
        const m = model({ name: "alice/model", ownerLogin: "alice" });
        expect(matchesModelPrice(m, "owner:alice")).toBe(true);
        expect(matchesModelPrice(m, "owner:bob")).toBe(false);
        expect(matchesModelPrice(model({ name: "x" }), "owner:alice")).toBe(
            false,
        );
    });

    it("filters by id", () => {
        const m = model({ name: "openai-fast" });
        expect(matchesModelPrice(m, "id:openai-fast")).toBe(true);
        expect(matchesModelPrice(m, "id:openai")).toBe(true);
        expect(matchesModelPrice(m, "id:other")).toBe(false);
    });

    it("filters by type", () => {
        const m = model({ name: "a", type: "image" });
        expect(matchesModelPrice(m, "type:image")).toBe(true);
        expect(matchesModelPrice(m, "type:text")).toBe(false);
    });

    it("filters by capability", () => {
        const m = model({
            name: "a",
            capabilities: ["reasoning" as never],
        });
        expect(matchesModelPrice(m, "capability:reasoning")).toBe(true);
        expect(matchesModelPrice(m, "capability:web_search")).toBe(false);
    });

    it("combines free text and filters with AND", () => {
        const m = model({
            name: "openai-fast",
            brand: "OpenAI",
            type: "text",
            capabilities: ["reasoning" as never],
        });
        expect(matchesModelPrice(m, "openai capability:reasoning")).toBe(true);
        expect(matchesModelPrice(m, "openai capability:web_search")).toBe(
            false,
        );
        expect(matchesModelPrice(m, "anthropic capability:reasoning")).toBe(
            false,
        );
    });

    it("requires all free-text terms", () => {
        const m = model({ name: "a", description: "fast open model" });
        expect(matchesModelPrice(m, "fast open")).toBe(true);
        expect(matchesModelPrice(m, "fast missing")).toBe(false);
    });
});
