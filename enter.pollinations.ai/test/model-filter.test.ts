import {
    matchesModel,
    parseQuery,
} from "@frontend/components/models/model-filter.ts";
import type { ModelPrice } from "@frontend/components/models/types.ts";
import { describe, expect, it } from "vitest";

function model(overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name: "test-model",
        type: "text",
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

describe("parseQuery", () => {
    it("returns empty results for an empty string", () => {
        expect(parseQuery("")).toEqual({ filters: [], terms: [] });
        expect(parseQuery("   ")).toEqual({ filters: [], terms: [] });
    });

    it("parses free-text terms", () => {
        expect(parseQuery("gpt flux")).toEqual({
            filters: [],
            terms: ["gpt", "flux"],
        });
    });

    it("parses a single key:value filter", () => {
        expect(parseQuery("access:paid")).toEqual({
            filters: [{ key: "access", value: "paid" }],
            terms: [],
        });
    });

    it("parses multiple filters", () => {
        expect(parseQuery("type:text access:free")).toEqual({
            filters: [
                { key: "type", value: "text" },
                { key: "access", value: "free" },
            ],
            terms: [],
        });
    });

    it("separates filters from free-text terms", () => {
        expect(parseQuery("gpt access:paid reasoning")).toEqual({
            filters: [{ key: "access", value: "paid" }],
            terms: ["gpt", "reasoning"],
        });
    });

    it("normalises to lowercase", () => {
        expect(parseQuery("GPT Access:Paid")).toEqual({
            filters: [{ key: "access", value: "paid" }],
            terms: ["gpt"],
        });
    });

    it("handles owner filter with slash in value", () => {
        expect(parseQuery("owner:voodoohop")).toEqual({
            filters: [{ key: "owner", value: "voodoohop" }],
            terms: [],
        });
    });
});

describe("matchesModel — free-text", () => {
    it("matches against model name", () => {
        const m = model({ name: "flux-pro" });
        expect(matchesModel(m, parseQuery("flux"))).toBe(true);
        expect(matchesModel(m, parseQuery("gemini"))).toBe(false);
    });

    it("matches against displayName / title", () => {
        const m = model({ displayName: "GPT 4o" });
        expect(matchesModel(m, parseQuery("gpt"))).toBe(true);
    });

    it("matches against description", () => {
        const m = model({ description: "Fast reasoning model" });
        expect(matchesModel(m, parseQuery("reasoning"))).toBe(true);
    });

    it("matches against brand", () => {
        const m = model({ brand: "OpenAI" });
        expect(matchesModel(m, parseQuery("openai"))).toBe(true);
    });

    it("matches against baseModel", () => {
        const m = model({ baseModel: "llama-3" });
        expect(matchesModel(m, parseQuery("llama"))).toBe(true);
    });

    it("matches against input modalities", () => {
        const m = model({ inputModalities: ["text", "image"] });
        expect(matchesModel(m, parseQuery("image"))).toBe(true);
    });

    it("matches against output modalities", () => {
        const m = model({ outputModalities: ["audio"] });
        expect(matchesModel(m, parseQuery("audio"))).toBe(true);
    });

    it("matches against capabilities", () => {
        const m = model({ capabilities: ["reasoning"] });
        expect(matchesModel(m, parseQuery("reasoning"))).toBe(true);
    });

    it("requires all free-text terms to match", () => {
        const m = model({ name: "openai-gpt", brand: "OpenAI" });
        expect(matchesModel(m, parseQuery("openai gpt"))).toBe(true);
        expect(matchesModel(m, parseQuery("openai flux"))).toBe(false);
    });

    it("returns true for an empty query", () => {
        expect(matchesModel(model(), parseQuery(""))).toBe(true);
    });
});

describe("matchesModel — access filter", () => {
    it("access:paid matches paidOnly models", () => {
        expect(
            matchesModel(model({ paidOnly: true }), parseQuery("access:paid")),
        ).toBe(true);
        expect(
            matchesModel(model({ paidOnly: false }), parseQuery("access:paid")),
        ).toBe(false);
        expect(matchesModel(model(), parseQuery("access:paid"))).toBe(false);
    });

    it("access:free matches free models", () => {
        expect(
            matchesModel(model({ free: true }), parseQuery("access:free")),
        ).toBe(true);
        expect(
            matchesModel(model({ free: false }), parseQuery("access:free")),
        ).toBe(false);
    });

    it("access:quest matches models that are neither paid-only nor free", () => {
        expect(matchesModel(model(), parseQuery("access:quest"))).toBe(true);
        expect(
            matchesModel(model({ paidOnly: true }), parseQuery("access:quest")),
        ).toBe(false);
        expect(
            matchesModel(model({ free: true }), parseQuery("access:quest")),
        ).toBe(false);
    });

    it("unknown access value matches nothing", () => {
        expect(matchesModel(model(), parseQuery("access:unknown"))).toBe(false);
    });
});

describe("matchesModel — owner filter", () => {
    it("matches community models by github login prefix", () => {
        const m = model({ name: "voodoohop/my-model", community: true });
        expect(matchesModel(m, parseQuery("owner:voodoohop"))).toBe(true);
        expect(matchesModel(m, parseQuery("owner:other"))).toBe(false);
    });

    it("does not match non-community models", () => {
        const m = model({ name: "voodoohop/my-model", community: false });
        expect(matchesModel(m, parseQuery("owner:voodoohop"))).toBe(false);
    });
});

describe("matchesModel — id filter", () => {
    it("matches model name substring", () => {
        const m = model({ name: "gpt-4o-mini" });
        expect(matchesModel(m, parseQuery("id:gpt-4o"))).toBe(true);
        expect(matchesModel(m, parseQuery("id:claude"))).toBe(false);
    });
});

describe("matchesModel — type filter", () => {
    it("matches model type", () => {
        expect(
            matchesModel(model({ type: "image" }), parseQuery("type:image")),
        ).toBe(true);
        expect(
            matchesModel(model({ type: "text" }), parseQuery("type:image")),
        ).toBe(false);
    });

    it("type:agent matches agent models", () => {
        expect(
            matchesModel(model({ agent: true }), parseQuery("type:agent")),
        ).toBe(true);
        expect(
            matchesModel(model({ agent: false }), parseQuery("type:agent")),
        ).toBe(false);
    });
});

describe("matchesModel — capability filter", () => {
    it("matches capability by exact name", () => {
        const m = model({ capabilities: ["reasoning", "tool_calling"] });
        expect(matchesModel(m, parseQuery("capability:reasoning"))).toBe(true);
        expect(matchesModel(m, parseQuery("capability:tool_calling"))).toBe(
            true,
        );
    });

    it("accepts hyphen form of capability names", () => {
        const m = model({ capabilities: ["tool_calling"] });
        expect(matchesModel(m, parseQuery("capability:tool-calling"))).toBe(
            true,
        );
    });

    it("returns false for unknown capability", () => {
        const m = model({ capabilities: ["reasoning"] });
        expect(matchesModel(m, parseQuery("capability:web_search"))).toBe(
            false,
        );
    });
});

describe("matchesModel — combined filters and terms", () => {
    it("applies all conditions together", () => {
        const m = model({
            name: "openai/gpt-agent",
            community: true,
            type: "text",
            agent: true,
            paidOnly: true,
            capabilities: ["reasoning"],
        });

        expect(
            matchesModel(
                m,
                parseQuery("gpt owner:openai type:agent access:paid"),
            ),
        ).toBe(true);

        // fails because type:image does not match
        expect(
            matchesModel(
                m,
                parseQuery("gpt owner:openai type:image access:paid"),
            ),
        ).toBe(false);
    });
});
