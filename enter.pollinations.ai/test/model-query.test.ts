import { describe, expect, it } from "vitest";
import {
    AGENT_QUERY_FILTER_KEYS,
    ensureModelQueryDefaults,
    getModelQueryDraftFilter,
    getModelQueryDraftSuggestionValue,
    getModelQueryFilterTokens,
    getModelQuerySuggestions,
    getModelQueryVisibleSearch,
    matchesModelQuery,
    parseModelQuery,
    removeModelQueryFilterToken,
    replaceModelQueryFilterToken,
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

it("finds canonical catalog entries through old search terms and saved id filters", () => {
    const candidate = model({
        name: "google/gemini-2.5-flash-lite:search",
        aliases: ["gemini-search"],
    });
    expect(matches(candidate, "gemini-search")).toBe(true);
    expect(matches(candidate, "id:GEMINI-SEARCH")).toBe(true);
    expect(matches(candidate, "id:google/gemini-2.5-flash-lite:search")).toBe(
        true,
    );
    expect(matches(candidate, "id:gemini-sea")).toBe(false);
    expect(
        matches(candidate, "id:google/gemini-2.5-flash-lite:search:openrouter"),
    ).toBe(false);
    expect(candidate.name).toBe("google/gemini-2.5-flash-lite:search");
    expect(getModelQuerySuggestions("id:google/", [candidate])).toEqual([
        "id:google/gemini-2.5-flash-lite:search ",
    ]);
    expect(
        matches(
            model({ name: "owner/community-model", community: true }),
            "id:owner/community-model",
        ),
    ).toBe(true);
});

describe("parseModelQuery", () => {
    it("separates case-insensitive filters from text terms", () => {
        expect(
            parseModelQuery(
                "Fast ACCESS:paid SOURCE:community publisher:Alice id:Alice/Coder type:text capability:tool-calling",
            ),
        ).toEqual({
            terms: ["fast"],
            filters: [
                { key: "access", value: "paid" },
                { key: "source", value: "community" },
                { key: "publisher", value: "alice" },
                { key: "id", value: "alice/coder" },
                { key: "type", value: "text" },
                { key: "capability", value: "tool-calling" },
            ],
        });
    });

    it("keeps unsupported, incomplete, and invalid filters as text", () => {
        expect(
            parseModelQuery("unknown:value access: access:any source:any"),
        ).toEqual({
            terms: ["unknown:value", "access:", "access:any", "source:any"],
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

describe("model query defaults", () => {
    it("preselects official and reliable without replacing explicit or unfinished filters", () => {
        expect(ensureModelQueryDefaults("")).toBe(
            "source:official status:reliable",
        );
        expect(ensureModelQueryDefaults("capability:reasoning")).toBe(
            "source:official status:reliable capability:reasoning",
        );
        expect(ensureModelQueryDefaults("source:community")).toBe(
            "status:reliable source:community",
        );
        expect(ensureModelQueryDefaults("source: status:")).toBe(
            "source: status:",
        );
        expect(ensureModelQueryDefaults("SOURCE:community status:all")).toBe(
            "SOURCE:community status:all",
        );
    });

    it("uses only defaults supported by the current list", () => {
        expect(ensureModelQueryDefaults("", AGENT_QUERY_FILTER_KEYS)).toBe(
            "status:reliable",
        );
        expect(
            ensureModelQueryDefaults(
                "publisher:alice",
                AGENT_QUERY_FILTER_KEYS,
            ),
        ).toBe("status:reliable publisher:alice");
        for (const query of ["status:all", "STATUS:healthy", "status:"]) {
            expect(
                ensureModelQueryDefaults(query, AGENT_QUERY_FILTER_KEYS),
            ).toBe(query);
        }
        expect(ensureModelQueryDefaults("", [])).toBe("");
        expect(ensureModelQueryDefaults("github", [])).toBe("github");
    });
});

it.each([
    { community: false, agent: false },
    { community: true, agent: false },
    { community: true, agent: true },
    { community: false, agent: true },
])("uses the same reliability cutoff for %j", (kind) => {
    for (const successRate of [0, 70, 80, 80.1, 90, 100, null]) {
        const candidate = model({
            ...kind,
            health: {
                status: successRate == null ? "unknown" : "degraded",
                requests: successRate == null ? 0 : 50,
                success_rate: successRate,
            },
        });
        const visible = successRate == null || successRate > 80;
        expect(matches(candidate, "status:reliable")).toBe(visible);
        expect(matches(candidate, "status:all")).toBe(true);
        expect(matches(candidate, "status:healthy")).toBe(false);
    }
    expect(matches(model(kind), "status:reliable")).toBe(true);
    expect(matches(model(kind), "status:healthy")).toBe(false);
});

it("keeps reliable and healthy as distinct status options", () => {
    expect(matches(model(), ensureModelQueryDefaults(""))).toBe(true);
    expect(
        matches(
            model({
                health: { status: "healthy", requests: 50, success_rate: 99 },
            }),
            ensureModelQueryDefaults(""),
        ),
    ).toBe(true);
    expect(matches(model(), "status:healthy")).toBe(false);
    expect(getModelQuerySuggestions("status:", [])).toEqual([
        "status:all ",
        "status:healthy ",
        "status:reliable ",
    ]);
});

describe("model query filter tokens", () => {
    it("finds completed and in-progress filters", () => {
        expect(
            getModelQueryFilterTokens(
                "source:official capability:tool-calling flux",
            ),
        ).toEqual([
            {
                filter: { key: "source", value: "official" },
                index: 0,
                token: "source:official",
            },
            {
                filter: { key: "capability", value: "tool-calling" },
                index: 1,
                token: "capability:tool-calling",
            },
        ]);
        expect(getModelQueryDraftFilter("source:official access:")).toEqual({
            index: 1,
            key: "access",
            value: "",
        });
    });

    it("removes any selected filter by position", () => {
        expect(
            removeModelQueryFilterToken(
                "source:official capability:tool-calling",
                0,
            ),
        ).toBe("capability:tool-calling");
        expect(
            replaceModelQueryFilterToken(
                "source:official capability:tool-calling",
                0,
                "source:community",
            ),
        ).toBe("source:community capability:tool-calling");
    });

    it("projects filter tokens out of the editable search value", () => {
        const query = "source:official flux capability:tool-calling access:pa";
        const filters = getModelQueryFilterTokens(query);
        const draft = getModelQueryDraftFilter(query, true);

        expect(getModelQueryVisibleSearch(query, filters, draft)).toBe(
            "flux pa",
        );
        expect(
            getModelQueryDraftSuggestionValue(
                "source:official flux access:paid ",
            ),
        ).toBe("paid ");
    });

    it("treats filters unsupported by the current tab as plain text", () => {
        const agentKeys = AGENT_QUERY_FILTER_KEYS;
        const query = "source:community access:paid capability:agent";

        expect(parseModelQuery(query, agentKeys)).toEqual({
            terms: ["source:community", "access:paid"],
            filters: [{ key: "capability", value: "agent" }],
        });
        expect(getModelQueryFilterTokens(query, agentKeys)).toHaveLength(1);
        expect(getModelQueryDraftFilter("access:", false, agentKeys)).toBe(
            undefined,
        );
    });
});

describe("matchesModelQuery", () => {
    it.each([
        ["canonical model ID", { name: "alice/quick-coder" }, "quick-coder"],
        ["title", { displayName: "Rapid Illustrator" }, "illustrator"],
        ["description", { description: "Great at restoration" }, "restoration"],
        ["publisher", { publisher: "Acme Labs" }, "acme"],
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
            publisher: "Alice AI",
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

    it("matches official publishers and public community owners", () => {
        const community = model({
            name: "PublicOwner/image-model",
            community: true,
            publisher: "internal-user-123",
        });

        expect(matches(community, "publisher:publicowner")).toBe(true);
        expect(matches(community, "publisher:public")).toBe(false);
        expect(
            matches(
                model({ publisher: "Moonshot AI" }),
                "publisher:moonshot-ai",
            ),
        ).toBe(true);
        expect(
            matches(model({ publisher: "NVIDIA" }), "publisher:nvidia"),
        ).toBe(true);
    });

    it("filters official and community model sources", () => {
        expect(matches(model(), "source:official")).toBe(true);
        expect(matches(model(), "source:community")).toBe(false);
        expect(matches(model({ community: true }), "source:community")).toBe(
            true,
        );
        expect(matches(model({ community: true }), "source:official")).toBe(
            false,
        );
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
                "quick publisher:alice type:text capability:reasoning access:quest",
            ),
        ).toBe(true);
        expect(
            matches(candidate, "quick publisher:alice capability:web-search"),
        ).toBe(false);
        expect(matches(candidate, "access:quest access:paid")).toBe(false);
    });

    it("matches an empty query", () => {
        expect(matches(model(), "   ")).toBe(true);
    });
});

describe("getModelQuerySuggestions", () => {
    const models = [
        model({ name: "openai/gpt", type: "text", publisher: "OpenAI" }),
        model({
            name: "Alice/quick-coder",
            community: true,
            agent: true,
            capabilities: ["tool_calling"],
        }),
        model({ name: "bob/painter", community: true, type: "image" }),
    ];

    it("suggests filter names and their values", () => {
        expect(getModelQuerySuggestions("", models)).toEqual([
            "access:",
            "capability:",
            "id:",
            "publisher:",
            "source:",
            "status:",
            "type:",
        ]);
        expect(getModelQuerySuggestions("access:", models)).toEqual([
            "access:free ",
            "access:paid ",
            "access:quest ",
        ]);
        expect(getModelQuerySuggestions("publisher:a", models)).toEqual([
            "publisher:alice ",
        ]);
        expect(getModelQuerySuggestions("publisher:o", models)).toEqual([
            "publisher:openai ",
        ]);
        expect(getModelQuerySuggestions("source:", models)).toEqual([
            "source:community ",
            "source:official ",
        ]);
    });

    it("completes only the current token", () => {
        expect(getModelQuerySuggestions("fast capability:t", models)).toEqual([
            "fast capability:tool-calling ",
        ]);
        expect(getModelQuerySuggestions("type:", models)).toEqual([
            "type:agent ",
            "type:image ",
            "type:text ",
        ]);
    });

    it("only suggests filters supported by the current tab", () => {
        const agentKeys = AGENT_QUERY_FILTER_KEYS;

        expect(getModelQuerySuggestions("", models, agentKeys)).toEqual([
            "capability:",
            "id:",
            "publisher:",
            "status:",
        ]);
        expect(getModelQuerySuggestions("status:", models, agentKeys)).toEqual([
            "status:all ",
            "status:healthy ",
            "status:reliable ",
        ]);
        expect(getModelQuerySuggestions("access:", models, agentKeys)).toEqual(
            [],
        );
    });
});
