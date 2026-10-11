import assert from "node:assert/strict";
import test from "node:test";
import {
    assess,
    officialCatalog,
    parentIssue,
    publicAddress,
    publicUrl,
    research,
    reserve,
    rpcJson,
    TOOLS,
} from "./researcher.mjs";

const model = {
    name: "publisher/example-v1",
    aliases: ["example"],
    community: false,
    category: "text",
};
const scopes = new Map(
    ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
        scope,
        new Set([scope]),
    ]),
);
const source = (id, domain, input = 2, output = 4) => ({
    id,
    url: `https://${domain}/models`,
    status: "fetched",
    text: `example-v1 available now; text and tools. Input $${input}.00, output $${output}.00 per 1M tokens.`,
});
const route = (provider, id, domain, input = 2, output = 4) => ({
    provider,
    providerWebsite: `https://${domain}`,
    upstreamModel: "example-v1",
    exactMatch: true,
    available: true,
    capabilitiesMatch: true,
    creditEligibility: "eligible",
    pricing: { currency: "USD", unit: "1M_tokens", input, output },
    claims: [
        { kind: "identity", sourceId: id, quote: "example-v1 available now" },
        {
            kind: "availability",
            sourceId: id,
            quote: "example-v1 available now",
        },
        { kind: "capabilities", sourceId: id, quote: "text and tools" },
        {
            kind: "price",
            sourceId: id,
            quote: `Input $${input}.00, output $${output}.00 per 1M tokens.`,
        },
    ],
});

test("official inventory excludes community entries, preserves aliases, rejects incomplete classification", () => {
    assert.deepEqual(
        officialCatalog([
            model,
            { ...model, name: "community/user/example", community: true },
        ]),
        [model],
    );
    assert.throws(
        () => officialCatalog([{ name: "unknown" }]),
        /classification/,
    );
    assert.throws(() => officialCatalog([model, model]), /inventory/);
});

test("exactly three option-based tools; no implementation or agent handoff", () => {
    assert.deepEqual(
        TOOLS.map((tool) => tool.function.name),
        ["search", "fetch", "research"],
    );
    assert.deepEqual(TOOLS[0].function.parameters.properties.engine.enum, [
        "exa",
        "perplexity",
        "gemini-search",
    ]);
    assert.deepEqual(TOOLS[2].function.parameters.properties.action.enum, [
        "compare",
        "verify",
        "submit",
    ]);
});

test("funded provider preference beats a lower sticker price but does not invent credit coverage", () => {
    const sources = [
        source("a", "learn.microsoft.com", 9, 12),
        source("f", "fireworks.ai"),
        source("o", "other.example", 1, 1),
    ];
    const result = assess(
        {
            routes: [
                route("other", "o", "other.example", 1, 1),
                route("fireworks", "f", "fireworks.ai"),
                route("azure", "a", "learn.microsoft.com", 9, 12),
            ],
            discoveries: [],
            gaps: [],
        },
        sources,
        scopes,
        model,
        [model],
    );
    assert.equal(result.recommendation.provider, "azure");
    assert.ok(
        result.routes.every(
            (row) =>
                row.creditEligibility === "unknown" &&
                row.cashCost === null &&
                !row.runtimeVerified,
        ),
    );
});

test("invented quote, wrong domain, and unknown price cannot certify a route", () => {
    const candidate = route("azure", "a", "learn.microsoft.com");
    candidate.claims[0].quote = "invented exact checkpoint";
    assert.equal(
        assess(
            { routes: [candidate], discoveries: [], gaps: [] },
            [source("a", "learn.microsoft.com")],
            scopes,
            model,
            [model],
        ).recommendation,
        null,
    );
    assert.equal(
        assess(
            {
                routes: [route("azure", "a", "learn.microsoft.com")],
                discoveries: [],
                gaps: [],
            },
            [source("a", "reddit.com")],
            scopes,
            model,
            [model],
        ).recommendation,
        null,
    );
    assert.throws(
        () =>
            assess(
                {
                    routes: [route("other", "a", "reddit.com")],
                    discoveries: [],
                    gaps: [],
                },
                [source("a", "reddit.com")],
                scopes,
                model,
                [model],
            ),
        /Community/,
    );
});

test("an exact Azure candidate retains preference when its price is missing, without certifying it", () => {
    const azure = route("azure", "a", "learn.microsoft.com");
    azure.pricing.input = null;
    azure.pricing.output = null;
    const result = assess(
        {
            routes: [route("other", "o", "other.example", 1, 1), azure],
            discoveries: [],
            gaps: [],
        },
        [
            source("a", "learn.microsoft.com"),
            source("o", "other.example", 1, 1),
        ],
        scopes,
        model,
        [model],
    );
    assert.equal(result.recommendation.provider, "azure");
    assert.equal(result.routes[1].verification, "unverified");
    assert.equal(result.routes[1].cashCost, null);
    assert.match(result.recommendation.rationale, /missing pricing/);
});

test("new-provider comparisons require complete prices and equivalent units", () => {
    const low = route("cheap", "a", "cheap.example", 1, 1),
        high = route("high", "b", "high.example", 2, 2);
    low.pricing.output = null;
    const result = assess(
        { routes: [low, high], discoveries: [], gaps: [] },
        [source("a", "cheap.example", 1, 1), source("b", "high.example", 2, 2)],
        scopes,
        model,
        [model],
    );
    assert.equal(result.recommendation.provider, "high");
});

test("missing preferred-provider coverage prevents final submission", () => {
    assert.throws(
        () =>
            assess(
                { routes: [], discoveries: [], gaps: [] },
                [],
                new Map(),
                model,
                [model],
            ),
        /coverage/,
    );
    assert.throws(
        () =>
            assess(
                { routes: [], discoveries: [], gaps: [] },
                [],
                new Map([
                    [
                        "discovery",
                        new Set(["web:a", "web:b", "web:c", "web:d"]),
                    ],
                ]),
                null,
                [model],
            ),
        /platform/,
    );
});

test("discovery needs distinct platforms, actual Exa search and local Scrapling evidence", () => {
    const queries = new Map([
        [
            "discovery",
            new Set([
                "reddit:exa:a",
                "huggingface:exa:b",
                "replit:exa:c",
                "web:exa:d",
            ]),
        ],
    ]);
    const report = { routes: [], discoveries: [], gaps: [] };
    assert.throws(
        () => assess(report, [], queries, null, [model]),
        /Scrapling/,
    );
    const sources = [
        { ...source("a", "provider.example"), method: "scrapling-http" },
    ];
    assert.equal(
        assess(report, sources, queries, null, [model]).recommendation,
        null,
    );
    assert.throws(
        () =>
            assess(
                report,
                sources,
                new Map([
                    [
                        "discovery",
                        new Set([
                            "reddit:perplexity:a",
                            "huggingface:perplexity:b",
                            "replit:perplexity:c",
                            "web:perplexity:d",
                        ]),
                    ],
                ]),
                null,
                [model],
            ),
        /Exa/,
    );
});

test("finite reservation is checked before the next paid operation", () => {
    const report = { maxPollen: 0.1, reservedPollen: 0, calls: [] };
    reserve(report, 0.07, "search");
    assert.throws(() => reserve(report, 0.01, "fetch"), /uncertain/);
    assert.throws(() => reserve(report, 0.04, "fetch"), /budget/);
    assert.equal(report.calls.length, 1);
    assert.equal(report.reservedPollen, 0.07);
    assert.throws(() => reserve(report, NaN, "search"), /finite/);
});

test("runner deadline preserves the last report before its job times out", () => {
    const report = {
        maxPollen: 1,
        reservedPollen: 0,
        calls: [],
        deadlineAt: "2000-01-01T00:00:00Z",
    };
    assert.throws(() => reserve(report, 0.1, "search"), /deadline/);
    assert.equal(report.calls.length, 0);
});

test("MCP adapter reads JSON and SSE results", () => {
    assert.deepEqual(
        rpcJson(
            'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}\n\n',
        ).result,
        { content: [] },
    );
    assert.deepEqual(rpcJson('{"result":{"tools":[]}}').result, { tools: [] });
    assert.throws(() => rpcJson("event: keepalive\n\n"), /result/);
});

test("source tool rejects private networks and credential URLs", async () => {
    for (const ip of [
        "127.0.0.1",
        "10.1.1.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
    ])
        assert.equal(publicAddress(ip), false);
    assert.equal(publicAddress("1.1.1.1"), true);
    await assert.rejects(publicUrl("https://127.0.0.1"), /Non-public/);
    await assert.rejects(
        publicUrl("https://1.1.1.1/?token=secret"),
        /Credential/,
    );
});

test("real tool-loop code enforces coverage before accepting a report", async () => {
    const calls = [
        [
            "research",
            { action: "submit", routes: [], discoveries: [], gaps: [] },
        ],
        ...["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            "search",
            { scope, engine: "exa", mode: "web", query: `example-v1 ${scope}` },
        ]),
        [
            "research",
            {
                action: "submit",
                routes: [],
                discoveries: [],
                gaps: ["No verified offers"],
            },
        ],
    ];
    let index = 0;
    const result = await research(
        { model },
        {
            infer: async (messages, tools) => {
                assert.deepEqual(
                    tools[0].function.parameters.properties.engine.enum,
                    ["exa"],
                );
                if (index === 1)
                    assert.match(messages.at(-1).content, /rejected/);
                const [name, args] = calls[index++];
                return {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: `call-${index}`,
                            type: "function",
                            function: { name, arguments: JSON.stringify(args) },
                        },
                    ],
                };
            },
            search: async () =>
                "No exact public model found; access remains unknown",
        },
        [model],
    );
    assert.equal(result.searches.length, 4);
    assert.equal(result.recommendation, null);
    assert.equal(index, 6);
});

test("parent issue is concise, includes partial coverage and manual handoff, never claims probes", () => {
    const issue = parentIssue(
        {
            startedAt: "2026-10-11T00:00:00Z",
            status: "partial",
            officialCount: 221,
            selectedCount: 221,
            models: [{ name: model.name, status: "researched" }],
            discovery: {},
            catalogDigest: "abc",
            sha: "sha",
        },
        "https://github.com/pollinations/pollinations/actions/runs/123/artifacts/456",
    );
    assert.match(issue.body, /1\/221/);
    assert.match(issue.body, /maintainer adds/);
    assert.match(issue.body, /does not trigger/);
    assert.throws(
        () => parentIssue({ models: [], discovery: {} }, "invalid"),
        /No completed/,
    );
});
