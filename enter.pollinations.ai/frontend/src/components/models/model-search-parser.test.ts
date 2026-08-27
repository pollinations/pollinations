import { describe, expect, it } from "vitest";
import { matchesQuery, parseQuery } from "./model-search-parser.ts";
import type { ModelPrice } from "./types.ts";

const makeModel = (overrides: Partial<ModelPrice> = {}): ModelPrice => ({
    name: "test-model",
    type: "text",
    capabilities: [],
    paidOnly: false,
    prices: [],
    ...overrides,
});

describe("parseQuery", () => {
    it("splits free-text terms", () => {
        expect(parseQuery("hello world")).toEqual({
            terms: ["hello", "world"],
            filters: new Map(),
        });
    });

    it("parses key:value filters", () => {
        const result = parseQuery("type:text access:paid");
        expect(result.terms).toEqual([]);
        expect(result.filters.get("type")).toBe("text");
        expect(result.filters.get("access")).toBe("paid");
        expect(result.filters.size).toBe(2);
    });

    it("parses quoted values", () => {
        const result = parseQuery('owner:"openai"');
        expect(result.terms).toEqual([]);
        expect(result.filters.get("owner")).toBe("openai");
    });

    it("combines free-text and filters", () => {
        const result = parseQuery("flux type:image");
        expect(result.terms).toEqual(["flux"]);
        expect(result.filters.get("type")).toBe("image");
        expect(result.filters.size).toBe(1);
    });

    it("normalizes to lowercase when called from matchesQuery", () => {
        const model = makeModel({ name: "flux", type: "image" });
        expect(matchesQuery(model, "Flux TYPE:Image")).toBe(true);
    });
});

describe("matchesQuery", () => {
    it("matches free text against name, brand, description, baseModel, modalities, capabilities", () => {
        const model = makeModel({
            name: "gpt-4",
            brand: "OpenAI",
            description: "Fast coding model",
            baseModel: "gpt-4-turbo",
            inputModalities: ["text", "image"],
            capabilities: ["tool_calling"],
        });

        expect(matchesQuery(model, "gpt-4")).toBe(true);
        expect(matchesQuery(model, "openai")).toBe(true);
        expect(matchesQuery(model, "coding")).toBe(true);
        expect(matchesQuery(model, "turbo")).toBe(true);
        expect(matchesQuery(model, "tool_calling")).toBe(true);
        expect(matchesQuery(model, "image")).toBe(true);
        expect(matchesQuery(model, "nonexistent")).toBe(false);
    });

    it("filters by type", () => {
        expect(matchesQuery(makeModel({ type: "image" }), "type:image")).toBe(true);
        expect(matchesQuery(makeModel({ type: "text" }), "type:image")).toBe(false);
    });

    it("filters by access:paid", () => {
        expect(matchesQuery(makeModel({ paidOnly: true }), "access:paid")).toBe(true);
        expect(matchesQuery(makeModel({ paidOnly: false }), "access:paid")).toBe(false);
    });

    it("filters by access:free", () => {
        expect(matchesQuery(makeModel({ paidOnly: false }), "access:free")).toBe(true);
        expect(matchesQuery(makeModel({ paidOnly: true }), "access:free")).toBe(false);
    });

    it("filters by owner", () => {
        const model = makeModel({ community: true, brand: "OpenAI" });
        expect(matchesQuery(model, "owner:openai")).toBe(true);
        expect(matchesQuery(model, "owner:anthropic")).toBe(false);
    });

    it("filters by id", () => {
        const model = makeModel({ name: "gpt-4-turbo", brand: "openai" });
        expect(matchesQuery(model, "id:gpt-4")).toBe(true);
        expect(matchesQuery(model, "id:openai/gpt-4")).toBe(true);
    });

    it("filters by capability", () => {
        const model = makeModel({ capabilities: ["tool_calling", "reasoning"] });
        expect(matchesQuery(model, "capability:tool_calling")).toBe(true);
        expect(matchesQuery(model, "capability:reasoning")).toBe(true);
        expect(matchesQuery(model, "capability:web_search")).toBe(false);
    });

    it("combines filters and free text", () => {
        const model = makeModel({
            name: "gpt-4",
            brand: "OpenAI",
            type: "text",
            paidOnly: true,
        });
        expect(matchesQuery(model, "gpt type:text access:paid")).toBe(true);
        expect(matchesQuery(model, "gpt type:image")).toBe(false);
        expect(matchesQuery(model, "gpt access:free")).toBe(false);
    });

    it("returns true for empty query", () => {
        expect(matchesQuery(makeModel(), "")).toBe(true);
    });
});
