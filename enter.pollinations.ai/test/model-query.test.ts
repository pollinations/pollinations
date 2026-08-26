import { describe, expect, test } from "vitest";
import {
    matchesParsedQuery,
    parseModelQuery,
} from "../frontend/src/components/models/model-query.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

function makeModel(
    overrides: Partial<ModelPrice> & { name: string },
): ModelPrice {
    return {
        type: "text",
        capabilities: [],
        prices: [],
        ...overrides,
    };
}

const communityModel = makeModel({
    name: "alice/quick-coder",
    displayName: "Quick Coder",
    description: "Fast coding assistant",
    brand: "Alice AI",
    community: true,
    capabilities: ["reasoning"],
    inputModalities: ["text", "image"],
});

const paidRegistryModel = makeModel({
    name: "openai-large",
    displayName: "OpenAI Large",
    paidOnly: true,
});

const freeModel = makeModel({
    name: "flux",
    type: "image",
    free: true,
});

describe("parseModelQuery", () => {
    test("splits text terms from known key:value filters", () => {
        expect(parseModelQuery("coder access:free alice")).toEqual({
            text: ["coder", "alice"],
            filters: [{ key: "access", value: "free" }],
        });
    });

    test("unknown keys stay text terms", () => {
        // "foo:bar" is not a filter — searched as plain text.
        expect(parseModelQuery("foo:bar")).toEqual({
            text: ["foo:bar"],
            filters: [],
        });
    });

    test("empty and bare-colon tokens are text or dropped", () => {
        expect(parseModelQuery("  ")).toEqual({ text: [], filters: [] });
        expect(parseModelQuery("access:")).toEqual({
            text: ["access:"],
            filters: [],
        });
    });

    test("multiple filters of different keys are all kept", () => {
        const parsed = parseModelQuery(
            "type:image access:paid capability:reasoning owner:bob",
        );
        expect(parsed.text).toEqual([]);
        expect(parsed.filters).toHaveLength(4);
    });

    test("keys are case-insensitive", () => {
        expect(parseModelQuery("ACCESS:free")).toEqual({
            text: [],
            filters: [{ key: "access", value: "free" }],
        });
    });
});

describe("matchesParsedQuery", () => {
    test("empty query matches everything", () => {
        expect(
            matchesParsedQuery(communityModel, { text: [], filters: [] }),
        ).toBe(true);
    });

    test("text terms search id, title, description, brand", () => {
        const parsed = parseModelQuery("quick coder");
        expect(matchesParsedQuery(communityModel, parsed)).toBe(true);

        // Brand match
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("alice ai")),
        ).toBe(true);

        // Canonical id match
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("alice/quick-coder"),
            ),
        ).toBe(true);

        // No match anywhere
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("video")),
        ).toBe(false);
    });

    test("all text terms must match (AND)", () => {
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("fast coder")),
        ).toBe(true);
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("fast unrelated"),
            ),
        ).toBe(false);
    });

    test("access:paid / quest / free", () => {
        expect(
            matchesParsedQuery(
                paidRegistryModel,
                parseModelQuery("access:paid"),
            ),
        ).toBe(true);
        expect(
            matchesParsedQuery(
                paidRegistryModel,
                parseModelQuery("access:quest"),
            ),
        ).toBe(false);
        expect(
            matchesParsedQuery(freeModel, parseModelQuery("access:free")),
        ).toBe(true);
        // A model that is neither paid-only nor free uses Quest pollen.
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("access:quest")),
        ).toBe(true);
    });

    test("owner:<login> matches community models only", () => {
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("owner:alice")),
        ).toBe(true);
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("owner:bob")),
        ).toBe(false);
        expect(
            matchesParsedQuery(
                paidRegistryModel,
                parseModelQuery("owner:openai"),
            ),
        ).toBe(false);
    });

    test("id:<model-id> is an exact canonical-id filter", () => {
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("id:alice/quick-coder"),
            ),
        ).toBe(true);
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("id:alice")),
        ).toBe(false);
    });

    test("type:<category>", () => {
        expect(
            matchesParsedQuery(freeModel, parseModelQuery("type:image")),
        ).toBe(true);
        expect(
            matchesParsedQuery(freeModel, parseModelQuery("type:text")),
        ).toBe(false);
    });

    test("capability:<capability> reads the displayed capabilities", () => {
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("capability:reasoning"),
            ),
        ).toBe(true);
        // GitHub-style hyphens normalize to underscores.
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("capability:web-search"),
            ),
        ).toBe(false);
        expect(
            matchesParsedQuery(freeModel, parseModelQuery("capability:tool")),
        ).toBe(false);
    });

    test("text terms and filters combine with AND", () => {
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("coder owner:alice"),
            ),
        ).toBe(true);
        expect(
            matchesParsedQuery(
                communityModel,
                parseModelQuery("coder owner:bob"),
            ),
        ).toBe(false);
    });

    test("modalities are searchable as text", () => {
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("image")),
        ).toBe(true);
        expect(
            matchesParsedQuery(communityModel, parseModelQuery("audio")),
        ).toBe(false);
    });
});
