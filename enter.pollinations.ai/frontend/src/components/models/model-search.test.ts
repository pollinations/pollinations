import { describe, expect, test } from "vitest";
import { matchesQuery, parseQuery } from "./model-search.ts";
import type { ModelCategory, ModelPrice } from "./types.ts";

function makeModel(overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name: "test-model",
        type: "text" as ModelCategory,
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

describe("parseQuery", () => {
    test("empty string returns no filters and no terms", () => {
        const result = parseQuery("");
        expect(result.filters).toEqual({});
        expect(result.terms).toEqual([]);
    });

    test("whitespace-only string returns no filters and no terms", () => {
        const result = parseQuery("   ");
        expect(result.filters).toEqual({});
        expect(result.terms).toEqual([]);
    });

    test("splits free-text terms", () => {
        const result = parseQuery("hello world");
        expect(result.terms).toEqual(["hello", "world"]);
        expect(result.filters).toEqual({});
    });

    test("parses key:value filters", () => {
        const result = parseQuery("access:paid type:video");
        expect(result.filters).toEqual({ access: "paid", type: "video" });
        expect(result.terms).toEqual([]);
    });

    test("combines free-text terms and filters", () => {
        const result = parseQuery("flux access:paid video");
        expect(result.filters).toEqual({ access: "paid" });
        expect(result.terms).toEqual(["flux", "video"]);
    });

    test("unknown filter keys are kept for forward compatibility", () => {
        const result = parseQuery("unknown:value hello");
        expect(result.filters.unknown).toBe("value");
        expect(result.terms).toEqual(["hello"]);
    });

    test("filter with empty value is treated as a term", () => {
        const result = parseQuery("access: hello");
        expect(result.filters).toEqual({});
        expect(result.terms).toEqual(["access:", "hello"]);
    });

    test("preserves case in filter values", () => {
        const result = parseQuery("owner:SomeUser id:MODEL-ID");
        expect(result.filters.owner).toBe("SomeUser");
        expect(result.filters.id).toBe("MODEL-ID");
    });
});

describe("matchesQuery", () => {
    test("empty query matches everything", () => {
        const model = makeModel({ name: "test", type: "text" });
        expect(matchesQuery(model, "")).toBe(true);
        expect(matchesQuery(model, "   ")).toBe(true);
    });

    test("free-text matches by name", () => {
        const model = makeModel({
            name: "gpt-5-pro",
            type: "text",
        });
        expect(matchesQuery(model, "gpt")).toBe(true);
        expect(matchesQuery(model, "gpt-5")).toBe(true);
        expect(matchesQuery(model, "nonexistent")).toBe(false);
    });

    test("free-text matches by displayName", () => {
        const model = makeModel({
            name: "model-x",
            displayName: "GPT-5.5 Luna",
            type: "text",
        });
        expect(matchesQuery(model, "luna")).toBe(true);
        expect(matchesQuery(model, "gpt-5.5")).toBe(true);
    });

    test("free-text matches by brand", () => {
        const model = makeModel({
            name: "model-x",
            brand: "Google",
            type: "text",
        });
        expect(matchesQuery(model, "google")).toBe(true);
    });

    test("free-text matches by description", () => {
        const model = makeModel({
            name: "model-x",
            description: "Fast text generation with strong reasoning",
            type: "text",
        });
        expect(matchesQuery(model, "reasoning")).toBe(true);
        expect(matchesQuery(model, "fast generation")).toBe(true);
    });

    test("free-text matches by modalities", () => {
        const model = makeModel({
            name: "model-x",
            type: "image",
            inputModalities: ["text", "image"],
            outputModalities: ["image"],
        });
        expect(matchesQuery(model, "video")).toBe(false);
        expect(matchesQuery(model, "audio")).toBe(false);
        expect(matchesQuery(model, "text image")).toBe(true);
    });

    test("free-text matches by capabilities", () => {
        const model = makeModel({
            name: "model-x",
            type: "text",
            capabilities: ["reasoning", "tool_calling"],
        });
        expect(matchesQuery(model, "reasoning")).toBe(true);
        expect(matchesQuery(model, "web_search")).toBe(false);
    });

    test("free-text requires all terms to match (AND logic)", () => {
        const model = makeModel({
            name: "gpt-5",
            brand: "OpenAI",
            type: "text",
        });
        expect(matchesQuery(model, "gpt openai")).toBe(true);
        expect(matchesQuery(model, "gpt anthropic")).toBe(false);
    });

    test("access:paid filter matches paidOnly models", () => {
        const model = makeModel({
            name: "paid-model",
            type: "text",
            paidOnly: true,
            free: false,
        });
        expect(matchesQuery(model, "access:paid")).toBe(true);
        expect(matchesQuery(model, "access:free")).toBe(false);
        expect(matchesQuery(model, "access:quest")).toBe(false);
    });

    test("access:free filter matches free models", () => {
        const model = makeModel({
            name: "free-model",
            type: "text",
            free: true,
            paidOnly: false,
        });
        expect(matchesQuery(model, "access:free")).toBe(true);
        expect(matchesQuery(model, "access:paid")).toBe(false);
        expect(matchesQuery(model, "access:quest")).toBe(false);
    });

    test("access:quest filter matches models that are not free and not paidOnly", () => {
        const model = makeModel({
            name: "quest-model",
            type: "text",
            free: false,
            paidOnly: false,
        });
        expect(matchesQuery(model, "access:quest")).toBe(true);
        expect(matchesQuery(model, "access:free")).toBe(false);
        expect(matchesQuery(model, "access:paid")).toBe(false);
    });

    test("owner: filter matches community model owner from name", () => {
        const model = makeModel({
            name: "someuser/my-model",
            type: "text",
            community: true,
        });
        expect(matchesQuery(model, "owner:someuser")).toBe(true);
        expect(matchesQuery(model, "owner:otheruser")).toBe(false);
    });

    test("owner: filter does not match non-community models", () => {
        const model = makeModel({
            name: "official-model",
            type: "text",
            community: false,
        });
        expect(matchesQuery(model, "owner:someuser")).toBe(false);
    });

    test("id: filter matches exact model name", () => {
        const model = makeModel({ name: "exact-model-id", type: "text" });
        expect(matchesQuery(model, "id:exact-model-id")).toBe(true);
        expect(matchesQuery(model, "id:partial")).toBe(false);
        expect(matchesQuery(model, "id:EXACT-MODEL-ID")).toBe(true);
    });

    test("type: filter matches model category", () => {
        const model = makeModel({ name: "model-x", type: "video" });
        expect(matchesQuery(model, "type:video")).toBe(true);
        expect(matchesQuery(model, "type:image")).toBe(false);
        expect(matchesQuery(model, "type:VIDEO")).toBe(true);
    });

    test("capability: filter matches model capabilities", () => {
        const model = makeModel({
            name: "model-x",
            type: "text",
            capabilities: ["reasoning", "web_search"],
        });
        expect(matchesQuery(model, "capability:reasoning")).toBe(true);
        expect(matchesQuery(model, "capability:web_search")).toBe(true);
        expect(matchesQuery(model, "capability:code_execution")).toBe(false);
    });

    test("filters and free-text terms combine with AND logic", () => {
        const model = makeModel({
            name: "flux-dev",
            brand: "Black Forest Labs",
            type: "image",
            paidOnly: false,
            free: true,
        });
        expect(matchesQuery(model, "flux access:free")).toBe(true);
        expect(matchesQuery(model, "flux access:paid")).toBe(false);
        expect(matchesQuery(model, "nonexistent access:free")).toBe(false);
    });

    test("unknown filter keys are ignored (forward-compatible)", () => {
        const model = makeModel({
            name: "model-x",
            type: "text",
        });
        expect(matchesQuery(model, "unknown:value")).toBe(true);
    });

    test("filter value without colon is treated as free-text", () => {
        const model = makeModel({
            name: "model-x",
            type: "text",
        });
        expect(matchesQuery(model, "owner")).toBe(false);
        expect(matchesQuery(model, "model-x")).toBe(true);
    });

    test("multiple free-text terms all match against same model fields", () => {
        const model = makeModel({
            name: "gpt-5",
            displayName: "GPT-5.5",
            description: "Advanced reasoning model",
            brand: "OpenAI",
            type: "text",
            capabilities: ["reasoning", "tool_calling"],
        });
        expect(matchesQuery(model, "gpt-5.5 reasoning")).toBe(true);
        expect(matchesQuery(model, "gpt-5 openai tool_calling")).toBe(true);
        expect(matchesQuery(model, "gpt-5 openai nonexistent")).toBe(false);
    });

    test("case-insensitive matching for free-text and filters", () => {
        const model = makeModel({
            name: "Flux-Dev",
            brand: "Black Forest Labs",
            type: "Text",
            capabilities: ["Reasoning"],
        });
        expect(matchesQuery(model, "flux")).toBe(true);
        expect(matchesQuery(model, "FLUX")).toBe(true);
        expect(matchesQuery(model, "type:text")).toBe(true);
        expect(matchesQuery(model, "capability:REASONING")).toBe(true);
    });
});
