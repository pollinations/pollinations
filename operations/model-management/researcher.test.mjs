import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    assess,
    main,
    officialCatalog,
    parentIssue,
    publicAddress,
    publicUrl,
    research,
    reserve,
    rpcJson,
    sourceText,
    TOOLS,
} from "./researcher.mjs";

const model = {
    name: "publisher/example-v1",
    aliases: ["example"],
    community: false,
    category: "text",
};

test("source decoder accepts actual page text and rejects crawler errors masquerading as content", () => {
    const text = "Exact primary-source evidence. ".repeat(5);
    assert.equal(sourceText(text), text);
    assert.equal(sourceText(JSON.stringify({ results: [{ text }] })), text);
    assert.throws(
        () =>
            sourceText(
                "Could not fetch https://example.com/model: CRAWL_EMPTY_CONTENT",
            ),
        /unavailable/,
    );
    assert.throws(
        () =>
            sourceText(
                "# Page not found | Provider API\nSuggested pages and other site navigation",
            ),
        /unavailable/,
    );
    assert.throws(
        () =>
            sourceText(
                JSON.stringify({ results: [{ text, error: "crawl failed" }] }),
            ),
        /fetch failed/,
    );
});
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
        "plan",
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

test("unknown Azure capability parity stays conditional; a known mismatch disqualifies it", () => {
    for (const capabilitiesMatch of [null, false]) {
        const azure = {
            ...route("azure", "a", "learn.microsoft.com"),
            capabilitiesMatch,
        };
        const result = assess(
            {
                routes: [azure, route("other", "o", "other.example", 1, 1)],
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
        assert.equal(result.routes[0].verification, "unverified");
        assert.equal(
            result.recommendation.provider,
            capabilitiesMatch === null ? "azure" : "other",
        );
    }
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
    const discoveries = [
        " PUBLISHER/EXAMPLE-V1 ",
        "EXAMPLE",
        "publisher/example-v2",
        "community/user/example-v1",
    ].map((name) => ({
        name,
        kind: "model",
        reason: "Primary-source lead",
        sourceIds: ["a"],
    }));
    assert.deepEqual(
        assess({ ...report, discoveries }, sources, queries, null, [
            model,
        ]).discoveries.map((item) => item.name),
        ["publisher/example-v2", "community/user/example-v1"],
    );
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
        [
            "research",
            {
                action: "plan",
                questions: [
                    "Which exact versions are available?",
                    "What is the full workload cost?",
                    "What evidence contradicts each offer?",
                ],
                routes: [],
                discoveries: [],
                gaps: [],
            },
        ],
        ...["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            "search",
            {
                scope,
                engine: "exa",
                mode: "web",
                purpose: scope === "alternatives" ? "challenge" : "explore",
                query: `example-v1 ${scope}`,
            },
        ]),
        [
            "search",
            {
                scope: "azure",
                engine: "exa",
                mode: "web",
                purpose: "explore",
                query: "example-v1 azure",
            },
        ],
        [
            "research",
            {
                action: "verify",
                routes: [],
                discoveries: [],
                gaps: ["No verified offers"],
            },
        ],
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
    let index = 0,
        searches = 0;
    const result = await research(
        { model },
        {
            infer: async (messages, tools) => {
                assert.deepEqual(
                    tools[0].function.parameters.properties.engine.enum,
                    ["exa"],
                );
                if (index === 1)
                    assert.match(
                        messages.findLast((message) => message.role === "tool")
                            .content,
                        /rejected/,
                    );
                if (index === 7)
                    assert.match(
                        messages.findLast((message) => message.role === "tool")
                            .content,
                        /Already attempted/,
                    );
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
            search: async () => {
                searches++;
                return "No exact public model found; access remains unknown";
            },
        },
        [model],
    );
    assert.equal(result.searches.length, 4);
    assert.equal(result.recommendation, null);
    assert.equal(result.plans.length, 1);
    assert.equal(index, 9);
    assert.equal(searches, 4);
});

test("focused fetch passes the model name and saved rereads select its exact excerpt", async () => {
    const url = "https://1.1.1.1/provider-models";
    const focus = model.name;
    const prefix = "Provider catalog introduction. ".repeat(4);
    const excerpt =
        `Exact ${focus} row with pricing and model details. `.repeat(4);
    const calls = [
        [
            "research",
            {
                action: "plan",
                questions: [
                    "Which exact versions are available?",
                    "What is the full workload cost?",
                    "What evidence contradicts each offer?",
                ],
                routes: [],
                discoveries: [],
                gaps: [],
            },
        ],
        ["fetch", { url, mode: "http" }],
        ["fetch", { url, mode: "auto", focus }],
        ["fetch", { url, mode: "saved", focus }],
        ["fetch", { url, mode: "saved" }],
    ];
    let index = 0;
    const fetched = [];
    await assert.rejects(
        research(
            { model },
            {
                infer: async (messages) => {
                    if (index === 4) {
                        const saved = JSON.parse(
                            messages.findLast(
                                (message) => message.role === "tool",
                            ).content,
                        );
                        assert.equal(saved.text, excerpt);
                        assert.equal(saved.focus, focus);
                        assert.equal(saved.excerptStart, 21000);
                        assert.equal(saved.totalCharacters, 45000);
                        assert.equal(saved.focusMatched, true);
                    }
                    const [name, args] = calls[index++];
                    return {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: `call-${index}`,
                                type: "function",
                                function: {
                                    name,
                                    arguments: JSON.stringify(args),
                                },
                            },
                        ],
                    };
                },
                fetch: async (requestedUrl, mode, requestedFocus) => {
                    fetched.push([requestedUrl, mode, requestedFocus]);
                    return requestedFocus === undefined
                        ? { text: prefix, method: "scrapling-http" }
                        : {
                              text: excerpt,
                              method: "scrapling-http",
                              excerptStart: 21000,
                              totalCharacters: 45000,
                              focusMatched: true,
                          };
                },
            },
            [model],
            calls.length,
        ),
        (error) => {
            assert.match(error.message, /turn budget/);
            assert.deepEqual(fetched, [
                [url, "http", undefined],
                [url, "auto", focus],
            ]);
            assert.equal(error.evidence.sources.length, 2);
            assert.equal(error.evidence.sources[0].text, prefix);
            assert.equal(error.evidence.sources[1].text, excerpt);
            assert.equal(error.evidence.sources[1].focus, focus);
            assert.equal(error.evidence.sources[1].excerptStart, 21000);
            assert.equal(error.evidence.sources[1].totalCharacters, 45000);
            assert.equal(error.evidence.sources[1].focusMatched, true);
            return true;
        },
    );
});

test("paid Perplexity requires explicit opt-in", async () => {
    for (const enabled of [false, true]) {
        await assert.rejects(
            research(
                { model },
                {
                    infer: async (messages, tools) => {
                        assert.deepEqual(
                            tools[0].function.parameters.properties.engine.enum,
                            enabled ? ["exa", "perplexity"] : ["exa"],
                        );
                        assert.ok(
                            JSON.parse(messages[1].content).currentUtcDate,
                        );
                        throw new Error("Stopped before any paid operation");
                    },
                },
                [model, { name: "perplexity", paid_only: true }],
                1,
                enabled,
            ),
            /Stopped before any paid operation/,
        );
    }
});

test("research archives page bodies but rereads exact evidence without network calls", async () => {
    const text = "Exact primary-source evidence 🪴 ".repeat(200);
    const calls = [
        [
            "research",
            {
                action: "plan",
                questions: [
                    "Which exact versions are available?",
                    "What is the full workload cost?",
                    "What evidence contradicts each offer?",
                ],
                routes: [],
                discoveries: [],
                gaps: [],
            },
        ],
        ...[1, 2, 3, 4].map((page) => [
            "fetch",
            { url: `https://1.1.1.1/page-${page}`, mode: "http" },
        ]),
        ["fetch", { url: "https://1.1.1.1/page-1", mode: "http" }],
        ["fetch", { url: "https://1.1.1.1/page-1", mode: "saved" }],
        ["fetch", { url: "https://1.1.1.1/page-1", mode: "saved" }],
    ];
    let index = 0,
        fetches = 0;
    await assert.rejects(
        research(
            { model },
            {
                infer: async (messages) => {
                    if (index === 5) {
                        const archived = messages
                            .filter((message) => message.role === "tool")
                            .map((message) => JSON.parse(message.content))
                            .find((payload) => payload.id === "s1");
                        assert.equal(archived.archived, true);
                        assert.equal(archived.text, undefined);
                        assert.ok(archived.excerpt.length <= 500);
                    }
                    if (index === 6)
                        assert.equal(
                            JSON.parse(
                                messages.findLast(
                                    (message) => message.role === "tool",
                                ).content,
                            ).text,
                            text,
                        );
                    const [name, args] = calls[index++];
                    return {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: `call-${index}`,
                                type: "function",
                                function: {
                                    name,
                                    arguments: JSON.stringify(args),
                                },
                            },
                        ],
                    };
                },
                fetch: async () => {
                    fetches++;
                    return { text, method: "scrapling-http" };
                },
            },
            [model],
            calls.length,
        ),
        (error) => {
            assert.match(error.message, /turn budget/);
            assert.equal(fetches, 4);
            assert.equal(error.evidence.sources.length, 4);
            assert.equal(error.evidence.sources[0].text, text);
            return true;
        },
    );
});

test("runner sends GPT-6.1 Sol medium effort and accounts for reasoning token allowance", async (t) => {
    const payloads = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url.includes("/models?"))
            return Response.json([
                model,
                {
                    name: "openai/gpt-6.1-sol",
                    community: false,
                    paid_only: false,
                    pricing: {
                        promptTextTokens: "0.000002",
                        completionTextTokens: "0.00001",
                    },
                },
            ]);
        if (url.endsWith("/mcp"))
            return Response.json({
                data: [
                    {
                        id: "exa",
                        pricing: {
                            rates: [
                                { kind: "search_request", price: 0.007 },
                                { kind: "page", price: 0.001 },
                            ],
                        },
                    },
                ],
            });
        assert.ok(url.endsWith("/v1/chat/completions"));
        payloads.push(JSON.parse(options.body));
        return Response.json({
            usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "No evidence gathered",
                    },
                },
            ],
        });
    });
    const oldExitCode = process.exitCode;
    try {
        const report = await main({
            POLLINATIONS_API_KEY: "test-only",
            MODELS: model.name,
            MAX_POLLEN: "1",
            RESEARCH_OUT: await mkdtemp(join(tmpdir(), "model-research-test-")),
        });
        assert.equal(payloads.length, 2);
        for (const payload of payloads) {
            assert.equal(payload.model, "openai/gpt-6.1-sol");
            assert.equal(payload.reasoning_effort, "medium");
            assert.equal(
                payload.max_tokens,
                JSON.parse(payload.messages[1].content).models ? 2000 : 6000,
            );
            assert.equal(payload.temperature, undefined);
            assert.match(
                payload.messages[0].content,
                /training knowledge is unusable as evidence/,
            );
            assert.match(
                JSON.parse(payload.messages[1].content).operatingPolicy,
                /Research the exact route/,
            );
        }
        assert.deepEqual(report.inference, {
            model: "openai/gpt-6.1-sol",
            reasoningEffort: "medium",
        });
        assert.ok(report.calls.every((call) => call.reserved >= 0.02));
        assert.match(report.guidance.digest, /^[a-f0-9]{64}$/);
    } finally {
        process.exitCode = oldExitCode;
    }
});

test("NomNom verification rejects endorsement-only research and preserves evidence", async () => {
    const calls = [
        [
            "research",
            {
                action: "plan",
                questions: [
                    "Which exact versions are available?",
                    "What is the full workload cost?",
                    "What evidence contradicts each offer?",
                ],
                routes: [],
                discoveries: [],
                gaps: [],
            },
        ],
        ...["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            "search",
            {
                scope,
                engine: "exa",
                mode: "web",
                purpose: "explore",
                query: `example-v1 ${scope}`,
            },
        ]),
        [
            "research",
            { action: "verify", routes: [], discoveries: [], gaps: [] },
        ],
        [
            "research",
            { action: "submit", routes: [], discoveries: [], gaps: [] },
        ],
    ];
    let index = 0;
    await assert.rejects(
        research(
            { model },
            {
                infer: async (messages) => {
                    if (index === 6)
                        assert.match(
                            messages.findLast(
                                (message) => message.role === "tool",
                            ).content,
                            /counter-evidence/,
                        );
                    const [name, args] = calls[index++];
                    return {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: `call-${index}`,
                                type: "function",
                                function: {
                                    name,
                                    arguments: JSON.stringify(args),
                                },
                            },
                        ],
                    };
                },
                search: async () =>
                    "No exact public model found; access remains unknown",
            },
            [model],
            calls.length,
        ),
        (error) => {
            assert.match(error.message, /turn budget/);
            assert.equal(error.evidence.plans.length, 1);
            assert.equal(error.evidence.searches.length, 4);
            return true;
        },
    );
});

test("parent issue prioritizes useful provider leads over a long unresolved inventory", () => {
    const artifactUrl =
        "https://github.com/pollinations/pollinations/actions/runs/123/artifacts/456";
    const report = {
        startedAt: "2026-10-11T00:00:00Z",
        status: "complete",
        selectedCount: 221,
        officialCount: 221,
        discovery: { status: "researched", discoveries: [] },
        models: Array.from({ length: 221 }, (_, i) => ({
            name: `publisher/unresolved-${i}`,
            status: "researched",
            routes: [],
            recommendation: null,
        })),
    };
    report.models[220] = {
        name: "publisher/useful-model",
        status: "researched",
        routes: [],
        recommendation: { provider: "azure" },
    };
    const issue = parentIssue(report, artifactUrl);
    assert.match(issue.body, /useful-model → azure/);
    assert.match(issue.body, /Unresolved providers: 220 models/);
    assert.doesNotMatch(issue.body, /unresolved-\d/);
    assert.ok(issue.body.length < 350);
    assert.ok(issue.body.split("\n").every((line) => line.startsWith("- ")));
});

test("parent issue gives concise model/provider findings, documented prices and verification reminder", () => {
    const artifactUrl =
        "https://github.com/pollinations/pollinations/actions/runs/123/artifacts/456";
    const issue = parentIssue(
        {
            startedAt: "2026-10-11T00:00:00Z",
            status: "partial",
            officialCount: 221,
            selectedCount: 221,
            models: [
                {
                    name: model.name,
                    status: "researched",
                    recommendation: { provider: "azure" },
                    routes: [
                        {
                            ...route("azure", "a", "learn.microsoft.com", 2, 4),
                            verification: "documented",
                        },
                        {
                            ...route(
                                "unverified-provider",
                                "u",
                                "unverified.example",
                                999,
                                999,
                            ),
                            verification: "unverified",
                        },
                    ],
                },
            ],
            discovery: {
                discoveries: [
                    { kind: "model", name: "publisher/new-model" },
                    { kind: "provider", name: "new-provider" },
                ],
            },
            catalogDigest: "abc",
            sha: "sha",
        },
        artifactUrl,
    );
    assert.match(issue.body, /1\/221/);
    assert.match(issue.body, /publisher\/example-v1 → azure/);
    assert.match(issue.body, /New models: publisher\/new-model/);
    assert.match(issue.body, /New providers: new-provider/);
    assert.match(issue.body, /azure: \$2 input, \$4 output per 1M_tokens/);
    assert.match(issue.body, /Verify: account credits and live routes/);
    assert.ok(issue.body.includes(`[Evidence](${artifactUrl})`));
    assert.doesNotMatch(
        issue.body,
        /999|unverified-provider|digest|\bsha\b|maintainer|trigger|handoff/i,
    );
    assert.ok(issue.body.split("\n").every((line) => line.startsWith("- ")));
    assert.ok(issue.body.length < 650);
    assert.throws(
        () => parentIssue({ models: [], discovery: {} }, "invalid"),
        /No completed/,
    );
});
