import { describe, expect, test } from "vitest";
import { matchesModelQuery, parseModelQuery } from "./model-query.ts";
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

describe("parseModelQuery", () => {
    test("empty string returns no filters and no terms", () => {
        const result = parseModelQuery("");
        expect(result.filters).toEqual([]);
        expect(result.terms).toEqual([]);
    });

    test("whitespace-only string returns no filters and no terms", () => {
        const result = parseModelQuery("   ");
        expect(result.filters).toEqual([]);
        expect(result.terms).toEqual([]);
    });

    test("splits free-text terms", () => {
        const result = parseModelQuery("hello world");
        expect(result.terms).toEqual(["hello", "world"]);
        expect(result.filters).toEqual([]);
    });

    test("parses key:value filters", () => {
        const result = parseModelQuery("access:paid type:video");
        expect(result.filters).toEqual([
            { key: "access", value: "paid" },
            { key: "type", value: "video" },
        ]);
        expect(result.terms).toEqual([]);
    });

    test("combines free-text terms and filters", () => {
        const result = parseModelQuery("flux access:paid video");
        expect(result.filters).toEqual([{ key: "access", value: "paid" }]);
        expect(result.terms).toEqual(["flux", "video"]);
    });

    test("unknown filter keys are kept as terms", () => {
        const result = parseModelQuery("unknown:value hello");
        expect(result.filters).toEqual([]);
        expect(result.terms).toEqual(["unknown:value", "hello"]);
    });

    test("filter with empty value is treated as a term", () => {
        const result = parseModelQuery("access: hello");
        expect(result.filters).toEqual([]);
        expect(result.terms).toEqual(["access:", "hello"]);
    });

    test("invalid access value degrades to term", () => {
        const result = parseModelQuery("access:maybe hello");
        expect(result.filters).toEqual([]);
        expect(result.terms).toEqual(["access:maybe", "hello"]);
    });

    test("preserves owner value case for matching", () => {
        const result = parseModelQuery("owner:SomeUser id:MODEL-ID");
        expect(result.filters).toEqual([
            { key: "owner", value: "SomeUser" },
            { key: "id", value: "MODEL-ID" },
        ]);
    });
});

describe("matchesModelQuery", () => {
    test("empty query matches everything", () => {
        const model = makeModel({ name: "test", type: "text" });
        expect(matchesModelQuery(model, parseModelQuery(""))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("   "))).toBe(true);
    });

    test("free-text matches by name", () => {
        const model = makeModel({
            name: "gpt-5-pro",
            type: "text",
        });
        expect(matchesModelQuery(model, parseModelQuery("gpt"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("gpt-5"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("nonexistent"))).toBe(
            false,
        );
    });

    test("free-text matches by displayName", () => {
        const model = makeModel({
            name: "model-x",
            displayName: "GPT-5.5 Luna",
            type: "text",
        });
        expect(matchesModelQuery(model, parseModelQuery("luna"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("gpt-5.5"))).toBe(true);
    });

    test("free-text matches by brand", () => {
        const model = makeModel({
            name: "model-x",
            brand: "Google",
            type: "text",
        });
        expect(matchesModelQuery(model, parseModelQuery("google"))).toBe(true);
    });

    test("free-text matches by description", () => {
        const model = makeModel({
            name: "model-x",
            description: "Fast text generation with strong reasoning",
            type: "text",
        });
        expect(matchesModelQuery(model, parseModelQuery("reasoning"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("fast generation"))).toBe(
            true,
        );
    });

    test("free-text matches by modalities", () => {
        const model = makeModel({
            name: "model-x",
            type: "image",
            inputModalities: ["text", "image"],
            outputModalities: ["image"],
        });
        expect(matchesModelQuery(model, parseModelQuery("video"))).toBe(false);
        expect(matchesModelQuery(model, parseModelQuery("audio"))).toBe(false);
        expect(matchesModelQuery(model, parseModelQuery("text image"))).toBe(true);
    });

    test("free-text matches by capabilities", () => {
        const model = makeModel({
            name: "model-x",
            type: "text",
            capabilities: ["reasoning", "tool_calling"],
        });
        expect(matchesModelQuery(model, parseModelQuery("reasoning"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("web_search"))).toBe(
            false,
        );
    });

    test("free-text requires all terms to match (AND logic)", () => {
        const model = makeModel({
            name: "gpt-5",
            brand: "OpenAI",
            type: "text",
        });
        expect(matchesModelQuery(model, parseModelQuery("gpt openai"))).toBe(true);
        expect(
            matchesModelQuery(model, parseModelQuery("gpt anthropic")),
        ).toBe(false);
    });

    test("access:paid filter matches paidOnly models", () => {
        const model = makeModel({
            name: "paid-model",
            type: "text",
            paidOnly: true,
            free: false,
        });
        expect(matchesModelQuery(model, parseModelQuery("access:paid"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:free"))).toBe(
            false,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:quest"))).toBe(
            false,
        );
    });

    test("access:free filter matches free models", () => {
        const model = makeModel({
            name: "free-model",
            type: "text",
            free: true,
            paidOnly: false,
        });
        expect(matchesModelQuery(model, parseModelQuery("access:free"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:paid"))).toBe(
            false,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:quest"))).toBe(
            false,
        );
    });

    test("access:quest filter matches models that are not free and not paidOnly", () => {
        const model = makeModel({
            name: "quest-model",
            type: "text",
            free: false,
            paidOnly: false,
        });
        expect(matchesModelQuery(model, parseModelQuery("access:quest"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:free"))).toBe(
            false,
        );
        expect(matchesModelQuery(model, parseModelQuery("access:paid"))).toBe(
            false,
        );
    });

    test("owner: filter matches community model owner from name prefix", () => {
        const model = makeModel({
            name: "someuser/my-model",
            type: "text",
            community: true,
        });
        expect(matchesModelQuery(model, parseModelQuery("owner:someuser"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("owner:otheruser"))).toBe(
            false,
        );
    });

    test("owner: filter does not match non-community models", () => {
        const model = makeModel({
            name: "official-model",
            type: "text",
            community: false,
        });
        expect(matchesModelQuery(model, parseModelQuery("owner:anyone"))).toBe(
            false,
        );
    });

    test("id: filter matches exact model id case-insensitively", () => {
        const model = makeModel({
            name: "Flux-Schnell",
            type: "image",
        });
        expect(matchesModelQuery(model, parseModelQuery("id:flux-schnell"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("id:FLUX-SCHNELL"))).toBe(
            true,
        );
        expect(matchesModelQuery(model, parseModelQuery("id:other"))).toBe(false);
    });

    test("type: filter matches canonical category", () => {
        const model = makeModel({
            name: "my-video-model",
            type: "video",
            community: true,
        });
        expect(matchesModelQuery(model, parseModelQuery("type:video"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("type:image"))).toBe(
            false,
        );
    });

    test("type: agent models match agent category", () => {
        const model = makeModel({
            name: "agent-model",
            type: "text",
            agent: true,
            community: true,
        });
        expect(matchesModelQuery(model, parseModelQuery("type:agent"))).toBe(true);
        expect(matchesModelQuery(model, parseModelQuery("type:text"))).toBe(false);
    });

    test("capability: filter matches model capabilities", () => {
        const model = makeModel({
            name: "smart-model",
            type: "text",
            capabilities: ["reasoning", "tool_calling"],
        });
        expect(
            matchesModelQuery(model, parseModelQuery("capability:reasoning")),
        ).toBe(true);
        expect(
            matchesModelQuery(model, parseModelQuery("capability:web_search")),
        ).toBe(false);
    });

    test("combined terms and filters use AND logic", () => {
        const model = makeModel({
            name: "flux-schnell",
            type: "image",
            community: true,
            free: false,
            paidOnly: true,
        });
        const parsed = parseModelQuery("flux access:paid");
        expect(matchesModelQuery(model, parsed)).toBe(true);
    });

    test("unrelated terms with matching filter still match", () => {
        const model = makeModel({
            name: "dall-e-3",
            type: "image",
            free: true,
        });
        // "xyz" won't match anything in haystack but access:free will
        const parsed = parseModelQuery("xyz access:free");
        expect(matchesModelQuery(model, parsed)).toBe(false); // term fails
    });

    test("query with only filter terms no free-text matching", () => {
        const model = makeModel({
            name: "test-model",
            type: "text",
            free: true,
        });
        expect(matchesModelQuery(model, parseModelQuery("access:free"))).toBe(
            true,
        );
    });
});
