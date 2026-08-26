import { describe, expect, it } from "vitest";
import {
    matchesModelQuery,
    parseModelQuery,
} from "../frontend/src/components/models/model-query.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

function model(name: string, overrides: Partial<ModelPrice> = {}): ModelPrice {
    return {
        name,
        type: "text",
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

const paidModel = () =>
    model("openai/gpt-5", {
        displayName: "GPT-5",
        description: "Flagship reasoning model",
        brand: "OpenAI",
        baseModel: "gpt-5-base",
        capabilities: ["reasoning", "tool_calling"],
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        paidOnly: true,
    });

describe("parseModelQuery", () => {
    it("returns empty parse for blank queries", () => {
        expect(parseModelQuery("")).toEqual({ terms: [], filters: [] });
        expect(parseModelQuery("   ")).toEqual({ terms: [], filters: [] });
    });

    it("splits free text from key:value filters", () => {
        const parsed = parseModelQuery(
            "fast type:image access:free owner:alice id:x/y capability:reasoning",
        );
        expect(parsed.terms).toEqual(["fast"]);
        expect(parsed.filters).toEqual([
            { key: "type", value: "image" },
            { key: "access", value: "free" },
            { key: "owner", value: "alice" },
            { key: "id", value: "x/y" },
            { key: "capability", value: "reasoning" },
        ]);
    });

    it("keeps unknown keys and invalid access values as terms", () => {
        const parsed = parseModelQuery("foo:bar access:everything openai");
        expect(parsed.terms).toEqual([
            "foo:bar",
            "access:everything",
            "openai",
        ]);
        expect(parsed.filters).toEqual([]);
    });

    it("is case-insensitive on filter keys and access values", () => {
        const parsed = parseModelQuery("TYPE:Image ACCESS:Paid");
        expect(parsed.filters).toEqual([
            { key: "type", value: "Image" },
            { key: "access", value: "paid" },
        ]);
    });
});

describe("matchesModelQuery", () => {
    it("matches every model for an empty query", () => {
        const parsed = parseModelQuery("");
        expect(matchesModelQuery(paidModel(), parsed)).toBe(true);
    });

    it("matches free text across loaded metadata", () => {
        const parsed = parseModelQuery("flagship");
        expect(matchesModelQuery(paidModel(), parsed)).toBe(true);
        expect(matchesModelQuery(paidModel(), parseModelQuery("flux"))).toBe(
            false,
        );
    });

    it("searches canonical id, brand, base model, modalities, capabilities", () => {
        for (const term of [
            "openai/gpt-5",
            "openai",
            "gpt-5-base",
            "image",
            "tool_calling",
        ]) {
            expect(matchesModelQuery(paidModel(), parseModelQuery(term))).toBe(
                true,
            );
        }
        expect(
            matchesModelQuery(paidModel(), parseModelQuery("nosuchword")),
        ).toBe(false);
    });

    it("filters by each access value", () => {
        const paid = paidModel();
        const free = model("flux", { free: true, type: "image" });
        const quest = model("openai-large", {});

        expect(matchesModelQuery(paid, parseModelQuery("access:paid"))).toBe(
            true,
        );
        expect(matchesModelQuery(free, parseModelQuery("access:paid"))).toBe(
            false,
        );
        expect(matchesModelQuery(free, parseModelQuery("access:free"))).toBe(
            true,
        );
        expect(matchesModelQuery(quest, parseModelQuery("access:quest"))).toBe(
            true,
        );
        expect(matchesModelQuery(paid, parseModelQuery("access:quest"))).toBe(
            false,
        );
    });

    it("matches owner only for community models with that login prefix", () => {
        const community = model("alice/tiny-agent", {
            community: true,
            agent: true,
        });
        const official = model("alice/impersonator");

        expect(
            matchesModelQuery(community, parseModelQuery("owner:alice")),
        ).toBe(true);
        // Case-insensitive owner match.
        expect(
            matchesModelQuery(community, parseModelQuery("owner:ALICE")),
        ).toBe(true);
        expect(
            matchesModelQuery(official, parseModelQuery("owner:alice")),
        ).toBe(false);
        expect(matchesModelQuery(community, parseModelQuery("owner:bob"))).toBe(
            false,
        );
    });

    it("matches exact canonical id case-insensitively", () => {
        expect(
            matchesModelQuery(paidModel(), parseModelQuery("id:OPENAI/GPT-5")),
        ).toBe(true);
        expect(
            matchesModelQuery(paidModel(), parseModelQuery("id:gpt-4")),
        ).toBe(false);
    });

    it("matches dashboard category including agents", () => {
        const agent = model("alice/tiny-agent", {
            community: true,
            agent: true,
        });
        expect(matchesModelQuery(agent, parseModelQuery("type:agent"))).toBe(
            true,
        );
        expect(matchesModelQuery(agent, parseModelQuery("type:text"))).toBe(
            false,
        );
        expect(
            matchesModelQuery(paidModel(), parseModelQuery("type:text")),
        ).toBe(true);
    });

    it("matches raw capability values", () => {
        expect(
            matchesModelQuery(
                paidModel(),
                parseModelQuery("capability:reasoning"),
            ),
        ).toBe(true);
        expect(
            matchesModelQuery(
                paidModel(),
                parseModelQuery("capability:code_execution"),
            ),
        ).toBe(false);
    });

    it("combines terms and filters with AND semantics", () => {
        const community = model("bob/painter", {
            community: true,
            type: "image",
            description: "Fast image generator",
        });
        expect(
            matchesModelQuery(
                community,
                parseModelQuery("fast owner:bob type:image"),
            ),
        ).toBe(true);
        expect(
            matchesModelQuery(
                community,
                parseModelQuery("fast owner:alice type:image"),
            ),
        ).toBe(false);
        expect(
            matchesModelQuery(community, parseModelQuery("slow owner:bob")),
        ).toBe(false);
    });
});
