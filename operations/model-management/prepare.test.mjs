import assert from "node:assert/strict";
import test from "node:test";
import { parseLeads, prepareResearch } from "./prepare.mjs";

const discoveryHosts = [
    "reddit.com",
    "quora.com",
    "huggingface.co",
    "replit.com",
    "github.com",
    "news.ycombinator.com",
    "news.example.org",
    "provider.example.org",
];

test("discovered niche providers become Jev-controlled official checkpoint followups", async () => {
    const f = fixture([]);
    f.services.remainingPollen = () => 1;
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ id }) => id === "niche-0") ??
                  actions.find(({ id }) => id === "finish")),
        selectedProbability: 0.98,
        requestDigest: "f".repeat(64),
    });
    await prepareResearch(
        {
            models: [{ name: "maker/Alpha-v3", category: "text" }],
            discoveryLeads: [
                {
                    name: "NicheServe",
                    kind: "provider",
                    sourceIds: ["provider-source"],
                },
            ],
        },
        f.services,
    );
    assert.equal(f.searches.length, 5);
    assert.match(
        f.searches.at(-1).query,
        /"NicheServe".*"Alpha-v3".*standard pricing TPS/,
    );
    assert.equal(f.searches.at(-1).engine, "exa");
});

function fixture(results, decisions = {}) {
    const searches = [],
        reads = [],
        triages = [];
    return {
        searches,
        reads,
        triages,
        services: {
            search: async (query, engine) => {
                searches.push({ query, engine });
                return JSON.stringify({ results });
            },
            read: async (args) => {
                reads.push(args);
                return {
                    id: `source-${reads.length}`,
                    url: args.url,
                    text: "Backend validated evidence",
                    status: "fetched",
                };
            },
            triage: async (names, excerpts) => {
                triages.push({ names, excerpts });
                return {
                    prioritizedIds: [],
                    ambiguousIds: excerpts.map(({ id }) => id),
                    irrelevantIds: [],
                    ...decisions,
                };
            },
        },
    };
}

test("native controller reorders required searches and chooses scoped followups without borrowing another model's coverage", async () => {
    const names = ["maker/Alpha-v3", "maker/Beta-v4"];
    const f = fixture(
        names.map((name, index) => ({
            url: `https://example.org/${index}`,
            title: name,
            text: name,
        })),
    );
    const controls = [];
    f.services.remainingPollen = () => 0.8;
    f.services.control = async (input) => {
        controls.push(input);
        assert.equal(input.remainingPollen, 0.8);
        const evidence = JSON.parse(input.evidence);
        assert.deepEqual(
            evidence.facts.map(({ name }) => name),
            names,
        );
        assert.ok(input.evidence.length < 10000);
        const next =
            input.stage === "search"
                ? (input.actions.find(({ scope }) => scope === "bedrock") ??
                  input.actions[0])
                : input.stage === "followup"
                  ? (input.actions.find(({ id }) => id === "price-1") ??
                    input.actions.find(({ id }) => id === "identity-0"))
                  : input.actions.find(({ kind }) => kind === "finish");
        return {
            action: next,
            selectedProbability: 0.98,
            requestDigest: "a".repeat(64),
        };
    };
    const result = await prepareResearch(
        { models: names.map((name) => ({ name, category: "text" })) },
        f.services,
    );
    assert.match(f.searches[0].query, /AWS Bedrock/);
    assert.equal(f.searches.length, 6);
    const followups = result.actions.filter(
        ({ tool, scope, models }) =>
            tool === "search" &&
            scope === "alternatives" &&
            models.length === 1,
    );
    assert.deepEqual(
        followups.map(({ models }) => models),
        [[names[1]], [names[0]]],
    );
    assert.ok(
        ![...result.coverage.get(names[0]).get("alternatives")].some((query) =>
            query.includes('"Beta-v4" official provider standard'),
        ),
    );
    assert.ok(
        [...result.coverage.get(names[1]).get("alternatives")].some((query) =>
            query.includes('"Beta-v4" official provider standard'),
        ),
    );
    assert.equal(
        controls.filter(({ stage }) => stage === "followup").length,
        2,
    );
    assert.equal(result.reasoningAction, null);
});

test("an insufficient native search choice stops without fabricated required coverage or Sol fallback", async () => {
    const f = fixture([]);
    f.services.control = async ({ actions }) => {
        assert.ok(actions.every(({ kind }) => kind === "search"));
        return {
            action: null,
            selectedProbability: 0.8,
            requestDigest: "b".repeat(64),
        };
    };
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3" }] },
        f.services,
    );
    assert.equal(f.searches.length, 0);
    assert.equal(result.coverage.get("maker/Alpha-v3").size, 0);
    assert.equal(result.reasoningAction, null);
    assert.ok(result.gaps.some((gap) => gap.includes("Jev could not select")));
});

test("native controller cannot change a copied bounded search query", async () => {
    const f = fixture([]);
    f.services.control = async ({ actions }) => ({
        action: { ...actions[0], query: "Changed unoffered search" },
        selectedProbability: 0.98,
        requestDigest: "c".repeat(64),
    });
    await assert.rejects(
        prepareResearch({ models: [{ name: "maker/Alpha-v3" }] }, f.services),
        /Controller must copy/,
    );
    assert.equal(f.searches.length, 0);
});

test("four bounded Exa provider challenges cover every supplied checkpoint and dedupe fetches", async () => {
    const models = [{ name: "maker/Alpha-v3" }, { name: "maker/Beta-v2" }];
    const f = fixture([
        {
            url: "https://docs.fireworks.ai/alpha",
            text: "Alpha-v3 exact checkpoint",
        },
        { url: "https://learn.microsoft.com/beta", text: "Beta-v2 pricing" },
        {
            url: "https://example.org/uncertain",
            text: "Unclear checkpoint identity",
        },
    ]);
    const result = await prepareResearch({ models }, f.services);
    assert.equal(f.searches.length, 4);
    assert.deepEqual(
        [...result.scopes.keys()],
        ["azure", "fireworks", "bedrock", "alternatives"],
    );
    for (const { query, engine } of f.searches) {
        assert.equal(engine, "exa");
        assert.ok(query.length <= 700);
        for (const { name } of models)
            assert.ok(query.includes(`"${name.split("/").at(-1)}"`));
        assert.ok(query.includes('("Alpha-v3" OR "Beta-v2")'));
    }
    assert.equal(
        f.searches[0].query,
        '(site:microsoft.com OR site:azure.com) Azure AI Foundry ("Alpha-v3" OR "Beta-v2") availability pricing catalog',
    );
    assert.ok(f.searches[1].query.startsWith("site:fireworks.ai"));
    assert.ok(f.searches[2].query.startsWith("site:amazon.com"));
    assert.ok(
        f.searches[3].query.includes(
            "restrictions retirement deprecation hidden fees",
        ),
    );
    for (const { name } of models)
        assert.equal(result.coverage.get(name).size, 4);
    assert.equal(f.reads.length, 3);
    assert.equal(new Set(f.reads.map(({ url }) => url)).size, 3);
    assert.equal(result.sources[0].text, "Backend validated evidence");
    assert.equal(result.triage.ambiguousIds.length, 3);
    assert.equal(
        result.leads.find(({ url }) => url.includes("alpha")).models[0],
        "maker/Alpha-v3",
    );
});

test("exact versions and every model's lead survive irrelevant triage and the read cap", async () => {
    const models = Array.from({ length: 8 }, (_, index) => ({
        name: `maker/Checkpoint-v${index}`,
    }));
    const rows = [
        ...Array.from({ length: 20 }, (_, index) => ({
            url: `https://example.org/noise/${index}`,
            text: "Checkpoint-v0.1 is another release",
        })),
        ...models.map(({ name }, index) => ({
            url: `https://fireworks.ai/checkpoint/${index}`,
            text: name,
        })),
    ];
    const f = fixture(rows, { irrelevantIds: ["lead-21", "lead-22"] });
    const result = await prepareResearch({ models }, f.services);
    assert.equal(result.leads.length, 16);
    assert.equal(f.reads.length, 16);
    for (const { name } of models)
        assert.ok(result.leads.some((lead) => lead.models.includes(name)));
    assert.ok(
        result.leads
            .filter(({ url }) => url.includes("noise"))
            .every((lead) => !lead.models.length),
    );
    assert.equal(result.unselectedLeadIds.length, 12);
    assert.ok(result.gaps.some((gap) => gap.includes("sixteen-lead")));
});

test("scope rotation preserves Bedrock and alternatives among preferred-provider-heavy leads", async () => {
    const f = fixture([]);
    const hosts = [
        "learn.microsoft.com",
        "fireworks.ai",
        "aws.amazon.com",
        "alternative.example.org",
    ];
    const counts = [12, 12, 4, 4];
    let search = 0;
    f.services.search = async () => {
        const index = search++;
        return JSON.stringify({
            results: Array.from({ length: counts[index] }, (_, lead) => ({
                url: `https://${hosts[index]}/catalog/${lead}`,
                text: "Alpha-v3 exact checkpoint",
            })),
        });
    };
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3" }] },
        f.services,
    );
    assert.equal(result.leads.length, 16);
    assert.equal(result.leads.length + result.unselectedLeads.length, 32);
    assert.equal(f.reads.length, 16);
    assert.deepEqual(
        result.leads.slice(0, 4).map(({ scopes }) => scopes[0]),
        ["azure", "fireworks", "bedrock", "alternatives"],
    );
    assert.deepEqual(
        result.leads.slice(4, 8).map(({ scopes }) => scopes[0]),
        ["azure", "fireworks", "bedrock", "alternatives"],
    );
    for (const host of hosts)
        assert.ok(f.reads.some(({ url }) => new URL(url).hostname === host));
});

test("an exact checkpoint in the safe URL receives only its literal model focus", async () => {
    const alpha = "https://fireworks.ai/models/maker/Alpha-v3";
    const f = fixture([
        { url: alpha, title: "Model details", text: "Available for inference" },
        {
            url: "https://learn.microsoft.com/beta",
            text: "Beta-v2 exact checkpoint",
        },
        {
            url: "https://example.org/models/Alpha-v3.1",
            text: "Another release",
        },
    ]);
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3" }, { name: "maker/Beta-v2" }] },
        f.services,
    );
    assert.deepEqual(result.leads.find(({ url }) => url === alpha).models, [
        "maker/Alpha-v3",
    ]);
    assert.deepEqual(
        f.reads.filter(({ url }) => url === alpha).map(({ focus }) => focus),
        ["Alpha-v3"],
    );
    assert.deepEqual(
        result.leads.find(({ url }) => url.includes("Alpha-v3.1")).models,
        [],
    );
});

test("parser preserves actual excerpts and rejects unsafe URLs without inventing any", () => {
    const raw =
        "Title: Actual title\nURL: https://example.org/actual\nText: literal snippet\nwith newline\nTitle: Unsafe\nURL: https://user:password@example.org/private\nText: secret";
    assert.deepEqual(parseLeads(raw), [
        {
            url: "https://example.org/actual",
            title: "Actual title",
            text: "literal snippet\nwith newline\n",
        },
    ]);
    assert.deepEqual(
        parseLeads(
            JSON.stringify({
                results: [
                    { url: "http://example.org", text: "bad" },
                    { url: "https://example.org?api_key=secret", text: "bad" },
                    {
                        title: "No URL",
                        text: "https://example.org/not-a-record",
                    },
                    {
                        url: `https://example.org/${"x".repeat(2048)}`,
                        text: "bad",
                    },
                ],
            }),
        ),
        [],
    );
});

test("search failure is propagated once with completed preparation receipts", async () => {
    const f = fixture([{ url: "https://example.org/alpha", text: "Alpha-v3" }]);
    const failure = new Error("Billing boundary rejected request");
    let calls = 0;
    const search = f.services.search;
    f.services.search = async (...args) => {
        calls++;
        if (calls === 2) throw failure;
        return search(...args);
    };
    await assert.rejects(
        prepareResearch({ models: [{ name: "maker/Alpha-v3" }] }, f.services),
        (error) => {
            assert.equal(error, failure);
            assert.equal(error.evidence.scopes.size, 1);
            assert.equal(error.evidence.actions.length, 2);
            assert.equal(
                error.evidence.leads[0].url,
                "https://example.org/alpha",
            );
            assert.equal(
                error.evidence.preparation.coverage.get("maker/Alpha-v3").size,
                1,
            );
            return true;
        },
    );
    assert.equal(calls, 2);
    assert.equal(f.reads.length, 0);
});

test("HTTP unavailable is retained without retry; missing versions leave explicit uncertainty", async () => {
    const f = fixture([
        { url: "https://learn.microsoft.com/catalog", text: "Model catalog" },
        { url: "https://example.org/v3.1", text: "Alpha-v3.1" },
    ]);
    f.services.read = async (args) => {
        f.reads.push(args);
        return {
            id: `source-${f.reads.length}`,
            url: args.url,
            status: "unavailable",
            reason: "HTTP unavailable",
        };
    };
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3" }] },
        f.services,
    );
    assert.equal(f.reads.length, 2);
    assert.equal(f.reads[0].focus, "Alpha-v3");
    assert.ok(result.leads.every((lead) => !lead.models.length));
    assert.ok(
        result.gaps.some((gap) => gap.includes("provider absence is unknown")),
    );
    assert.ok(
        result.sources.every((source) => source.status === "unavailable"),
    );
});

test("market discovery uses eight dated modes with no identity triage or Sol call", async () => {
    const f = fixture(
        ["reddit.com", "huggingface.co", "replit.com", "github.com"].map(
            (host) => ({
                url: `https://${host}/actual`,
                text: "A real discovery lead",
            }),
        ),
    );
    const result = await prepareResearch(
        { officialNames: [{ name: "maker/Alpha" }] },
        f.services,
    );
    assert.equal(f.searches.length, 8);
    assert.equal(result.scopes.get("discovery").size, 8);
    assert.deepEqual(
        result.actions
            .filter(({ tool }) => tool === "search")
            .map(({ mode }) => mode),
        [
            "reddit",
            "quora",
            "huggingface",
            "replit",
            "github",
            "hackernews",
            "news",
            "providers",
        ],
    );
    assert.ok(
        f.searches.every(({ query }) =>
            query.includes(new Date().toISOString().slice(0, 7)),
        ),
    );
    assert.equal(f.triages.length, 0);
    assert.equal(f.reads.length, 8);
    assert.equal(result.requiredEvidencePending, false);
});

test("discovery preserves eight-mode diversity within sixty-four candidates and sixteen reads", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () => {
        const current = bucket++;
        return JSON.stringify({
            results: Array.from({ length: 20 }, (_, index) => ({
                url: `https://${discoveryHosts[current]}/${index}`,
                text: "Actual release lead",
            })),
        });
    };
    const result = await prepareResearch({}, f.services);
    assert.equal(result.leads.length, 16);
    assert.equal(result.unselectedLeads.length, 48);
    assert.equal(f.reads.length, 20);
    const modes = [
        "reddit",
        "quora",
        "huggingface",
        "replit",
        "github",
        "hackernews",
        "news",
        "providers",
    ];
    assert.deepEqual(
        result.leads.slice(0, 8).map(({ modes }) => modes[0]),
        modes,
    );
    assert.deepEqual(
        result.leads.slice(8).map(({ modes }) => modes[0]),
        modes,
    );
    assert.ok(
        result.leads.every(
            ({ url }) => Number(new URL(url).pathname.slice(1)) < 8,
        ),
    );
});

test("discovery crawl reads only copied Jev links, dedupes URLs and caps each page and all reads", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () => {
        const current = bucket++;
        return JSON.stringify({
            results: Array.from({ length: 2 }, (_, index) => ({
                url: `https://${discoveryHosts[current]}/${index}`,
                text: "Actual model release",
            })),
        });
    };
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        links: Array.from({ length: 12 }, (_, index) => ({
            url:
                index === 0
                    ? args.url
                    : `https://publisher.example.org/${encodeURIComponent(args.url)}/${index}`,
            text: index <= 2 ? "Model release pricing" : "More links",
        })),
    });
    let crawlChoices = 0;
    f.services.control = async ({ stage, actions }) => {
        if (stage === "crawl") {
            crawlChoices++;
            assert.ok(actions.length <= 13);
            assert.ok(
                actions.every(({ required }) => required) ||
                    actions.some(
                        ({ text }) => text === "Model release pricing",
                    ),
            );
        }
        return {
            action:
                stage === "reasoning"
                    ? actions.find(({ kind }) => kind === "finish")
                    : stage === "crawl"
                      ? (actions.find(
                            ({ sourceId }) => sourceId === "source-1",
                        ) ?? actions[0])
                      : actions[0],
        };
    };
    const result = await prepareResearch({}, f.services);
    assert.equal(crawlChoices, 8);
    assert.equal(f.reads.length, 24);
    assert.equal(new Set(f.reads.map(({ url }) => url)).size, 24);
    const counts = new Map();
    for (const action of result.actions.filter(
        ({ parentSourceId }) => parentSourceId,
    ))
        counts.set(
            action.parentSourceId,
            (counts.get(action.parentSourceId) ?? 0) + 1,
        );
    assert.ok([...counts.values()].every((count) => count <= 2));
    assert.equal(counts.get("source-1"), 2);
});

test("discovery crawl finish performs no additional read and cannot mutate a link", async () => {
    const f = fixture([
        { url: "https://example.org/actual", text: "Actual release" },
    ]);
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        links: [
            {
                url: "https://publisher.example.org/release",
                text: "Model release",
            },
        ],
    });
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : actions.find(({ kind }) => kind === "finish"),
    });
    await prepareResearch({}, f.services);
    assert.equal(f.reads.length, 1);
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "crawl"
                ? { ...actions[0], url: "https://other.example.org/invented" }
                : actions[0],
    });
    await assert.rejects(
        prepareResearch({}, f.services),
        /Controller must copy/,
    );
    assert.equal(f.reads.length, 2);
});

test("Jev can choose the free official Hub metric feed without a Sol call", async () => {
    const f = fixture([]);
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : stage === "crawl"
                  ? (actions.find(({ id }) => id === "hub-feed-0") ??
                    actions.find(({ required }) => required) ??
                    actions.find(({ kind }) => kind === "finish"))
                  : actions.find(({ kind }) => kind === "finish"),
    });
    const result = await prepareResearch({}, f.services);
    assert.equal(f.reads.length, 4);
    assert.equal(result.requiredEvidencePending, false);
    assert.equal(
        f.reads[0].url,
        "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20",
    );
    assert.equal(f.reads[0].maxCharacters, 18000);
    assert.equal(result.actions.find(({ feed }) => feed).status, "fetched");
    assert.equal(result.reasoningAction, null);
});

test("a blocked page gets an Exa fallback only when Jev selects it", async () => {
    const f = fixture([
        { url: "https://quora.com/release", text: "New model demand" },
    ]);
    f.services.read = async (args) => {
        f.reads.push(args);
        return {
            id: `source-${f.reads.length}`,
            url: args.url,
            status: args.mode === "exa" ? "fetched" : "unavailable",
            text: args.mode === "exa" ? "Retrieved public discussion" : "",
            links: [],
        };
    };
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : stage === "crawl"
                  ? (actions.find(({ required }) => required) ??
                    actions.find(({ kind }) => kind === "finish"))
                  : actions.find(({ kind }) => kind === "finish"),
    });
    const result = await prepareResearch({}, f.services);
    assert.deepEqual(
        f.reads.map(({ mode }) => mode),
        ["http", "http", "http", "http", "http", "exa", "exa", "exa", "exa"],
    );
    assert.equal(result.sources[0].status, "unavailable");
    assert.equal(result.sources[5].status, "fetched");
    assert.ok(f.reads.length <= 24);
    assert.equal(result.requiredEvidencePending, false);
    assert.ok(
        result.actions.some(
            (action) =>
                action.mode === "exa" && action.parentSourceId === "source-4",
        ),
    );
});

test("missing and failed discovery buckets preserve explicit unknown evidence", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () =>
        JSON.stringify({
            results:
                bucket++ === 0
                    ? [
                          {
                              url: "https://reddit.com/actual",
                              text: "Actual lead",
                          },
                      ]
                    : [],
        });
    f.services.read = async ({ url }) => ({
        id: "source-1",
        url,
        status: "unavailable",
    });
    const result = await prepareResearch({}, f.services);
    assert.ok(
        result.gaps.includes("quora: no usable safe search lead returned"),
    );
    assert.ok(
        result.gaps.includes(
            "reddit: fetched discovery evidence remains unresolved",
        ),
    );
    assert.ok(
        result.gaps.includes(
            "providers: fetched discovery evidence remains unresolved",
        ),
    );
});

test("shared catalog uses separate literal focuses and first gives every model a read", async () => {
    const models = Array.from({ length: 8 }, (_, index) => ({
        name: `maker/Model-v${index}`,
    }));
    const f = fixture([
        { url: "https://learn.microsoft.com/catalog", text: "Model catalog" },
        ...Array.from({ length: 20 }, (_, index) => ({
            url: `https://example.org/alternative/${index}`,
            text: "An uncertain provider",
        })),
    ]);
    await prepareResearch({ models }, f.services);
    assert.deepEqual(
        f.reads.slice(0, 8).map(({ focus }) => focus),
        models.map(({ name }) => name.split("/").at(-1)),
    );
    assert.ok(
        f.reads
            .slice(0, 8)
            .every(({ url }) => url === "https://learn.microsoft.com/catalog"),
    );
    assert.equal(f.reads.length, 23);
    assert.ok(
        f.reads.every(
            ({ focus }) =>
                !focus || (focus.length <= 200 && !focus.includes(" ")),
        ),
    );
    assert.equal(
        new Set(f.reads.map(({ url, focus }) => JSON.stringify([url, focus])))
            .size,
        f.reads.length,
    );
});

test("shared exact checkpoint catalogs stay within twenty-four reads with explicit unfetched gaps", async () => {
    const models = [{ name: "maker/Alpha-v3" }, { name: "maker/Beta-v2" }];
    const f = fixture(
        Array.from({ length: 16 }, (_, index) => ({
            url: `https://learn.microsoft.com/catalog/${index}`,
            text: "Alpha-v3 and Beta-v2 are listed",
        })),
    );
    const result = await prepareResearch({ models }, f.services);
    assert.deepEqual(
        f.reads.slice(0, 2).map(({ focus }) => focus),
        ["Alpha-v3", "Beta-v2"],
    );
    assert.equal(f.reads[0].url, f.reads[1].url);
    assert.equal(f.reads.length, 24);
    assert.ok(result.gaps.some((gap) => gap.includes("twenty-four-read")));
});

test("credential URL keys are rejected before triage or HTTP reads", async () => {
    const keys = [
        "access_token",
        "signature",
        "X-Amz-Credential",
        "X-Amz-Security-Token",
        "X-Amz-Signature",
        "api-key",
        "auth",
        "sig",
        "client_secret",
        "password",
        "accessKey",
    ];
    const unsafe = keys.map((key) => ({
        url: `https://example.org/model?${key}=redacted-placeholder`,
        text: "Alpha-v3",
    }));
    assert.deepEqual(parseLeads(JSON.stringify({ results: unsafe })), []);
    const f = fixture([
        ...unsafe,
        { url: "https://example.org/public", text: "Alpha-v3" },
    ]);
    await prepareResearch({ models: [{ name: "maker/Alpha-v3" }] }, f.services);
    assert.deepEqual(
        f.triages[0].excerpts.map(({ url }) => url),
        ["https://example.org/public"],
    );
    assert.deepEqual(
        f.reads.map(({ url }) => url),
        ["https://example.org/public"],
    );
});

test("unselected IDs resolve to bounded preserved records without entering triage", async () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
        url: `https://example.org/lead/${index}`,
        title: `Title ${index}`,
        text: "Alpha-v3 exact snippet",
    }));
    const f = fixture(rows);
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3" }] },
        f.services,
    );
    assert.equal(result.leads.length, 16);
    assert.equal(result.unselectedLeads.length, 16);
    assert.deepEqual(
        result.unselectedLeadIds,
        result.unselectedLeads.map(({ id }) => id),
    );
    assert.equal(result.unselectedLeads[0].url, "https://example.org/lead/16");
    assert.equal(result.unselectedLeads[0].title, "Title 16");
    assert.equal(result.unselectedLeads[0].text, "Alpha-v3 exact snippet");
    assert.equal(f.triages[0].excerpts.length, 16);
    assert.ok(
        f.triages[0].excerpts.every(
            ({ id }) => !result.unselectedLeadIds.includes(id),
        ),
    );
    assert.ok(result.gaps.some((gap) => gap.includes("thirty-two-candidate")));
});

test("Exa Highlights and Published preserve literal plain-text and JSON receipts", () => {
    const lead = {
        url: "https://www.reddit.com/r/LocalLLaMA/comments/actual",
        title: "Release discussion",
        text: "Literal model release excerpt",
        publishedAt: "2026-10-12T00:00:00Z",
    };
    assert.deepEqual(
        parseLeads(
            `Title: ${lead.title}\nURL: ${lead.url}\nPublished: ${lead.publishedAt}\nHighlights: ${lead.text}`,
        ),
        [lead],
    );
    assert.deepEqual(
        parseLeads(
            JSON.stringify({
                results: [
                    { ...lead, text: undefined, highlights: [lead.text, 123] },
                ],
            }),
        ),
        [lead],
    );
});

test("platform modes exclude off-domain and lookalike results while broad searches retain them", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () => {
        const root = discoveryHosts[bucket++];
        return JSON.stringify({
            results: [
                {
                    url: "https://en.wikipedia.org/wiki/AI",
                    text: "Off-platform",
                },
                { url: `https://${root}.example.org/fake`, text: "Lookalike" },
                {
                    url: `https://sub.${root}/actual`,
                    text: "Actual platform source",
                },
            ],
        });
    };
    const result = await prepareResearch({}, f.services);
    for (const [index, mode] of [
        "reddit",
        "quora",
        "huggingface",
        "replit",
        "github",
        "hackernews",
    ].entries()) {
        const rows = result.leads.filter((lead) => lead.modes.includes(mode));
        assert.equal(rows.length, 1);
        assert.equal(
            new URL(rows[0].url).hostname,
            `sub.${discoveryHosts[index]}`,
        );
        assert.ok(
            result.gaps.some((gap) =>
                gap.startsWith(`${mode}: discarded 2 off-platform`),
            ),
        );
    }
    const wiki = result.leads.find(
        ({ url }) => new URL(url).hostname === "en.wikipedia.org",
    );
    assert.deepEqual(wiki.modes, ["news", "providers"]);
});

test("required free feeds all precede optional finish and insufficient selection stays pending", async () => {
    const f = fixture([]);
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ required }) => required) ??
                  actions.find(({ kind }) => kind === "finish")),
    });
    const result = await prepareResearch({}, f.services);
    assert.equal(f.reads.length, 4);
    assert.ok(f.reads.every(({ mode }) => mode === "http"));
    assert.deepEqual(
        f.reads.slice(2).map(({ url }) => url),
        [
            "https://www.reddit.com/r/LocalLLaMA/top/?t=week",
            "https://www.reddit.com/r/StableDiffusion/top/?t=week",
        ],
    );
    assert.equal(result.requiredEvidencePending, false);
    f.reads.length = 0;
    f.services.control = async ({ stage, actions }) => ({
        action: stage === "search" ? actions[0] : null,
    });
    const partial = await prepareResearch({}, f.services);
    assert.equal(f.reads.length, 0);
    assert.equal(partial.requiredEvidencePending, true);
});

test("blocked required community seeds fallback only after HTTP and remain inside the shared read bounds", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () =>
        JSON.stringify({
            results: Array.from({ length: 2 }, (_, index) => ({
                url: `https://${discoveryHosts[bucket]}/${index}`,
                text: "Release lead",
            })),
        });
    const search = f.services.search;
    f.services.search = async (...args) => {
        const raw = await search(...args);
        bucket++;
        return raw;
    };
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        status:
            args.url.includes("/top/") && args.mode === "http"
                ? "unavailable"
                : "fetched",
        links: [
            {
                url: `https://publisher.example.org/${f.reads.length}`,
                text: "Model release",
            },
        ],
    });
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "reasoning"
                ? actions.find(({ kind }) => kind === "finish")
                : actions[0],
    });
    const result = await prepareResearch({}, f.services);
    assert.equal(f.reads.filter(({ mode }) => mode === "http").length, 24);
    assert.equal(
        f.reads.slice(16).filter(({ mode }) => mode === "http").length,
        8,
    );
    assert.equal(f.reads.filter(({ mode }) => mode === "exa").length, 2);
    assert.equal(f.reads.length, 26);
    for (const action of result.actions.filter(({ mode }) => mode === "exa")) {
        const parent = result.sources.find(
            ({ id }) => id === action.parentSourceId,
        );
        assert.equal(parent.status, "unavailable");
        assert.equal(parent.url, action.url);
        const first = f.reads.findIndex(({ url }) => url === action.url);
        assert.equal(f.reads[first].mode, "http");
        assert.ok(
            first <
                f.reads.findIndex(
                    ({ url, mode }) => url === action.url && mode === "exa",
                ),
        );
    }
    assert.equal(result.requiredEvidencePending, false);
});

test("all blocked discovery reads keep fallback menus bounded and record unresolved fetched coverage", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () => {
        const host = discoveryHosts[bucket++];
        return JSON.stringify({
            results: Array.from({ length: 2 }, (_, index) => ({
                url: `https://${host}/${index}`,
                text: "Release lead",
            })),
        });
    };
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        status: "unavailable",
    });
    f.services.control = async ({ stage, actions }) => {
        assert.ok(actions.length <= 13);
        return {
            action:
                stage === "reasoning"
                    ? actions.find(({ kind }) => kind === "finish")
                    : actions[0],
        };
    };
    const result = await prepareResearch({}, f.services);
    assert.equal(f.reads.filter(({ mode }) => mode === "http").length, 20);
    assert.equal(f.reads.filter(({ mode }) => mode === "exa").length, 4);
    const hubFallbacks = f.reads.filter(
        ({ mode, url }) =>
            mode === "exa" && new URL(url).hostname === "huggingface.co",
    );
    assert.equal(hubFallbacks.length, 2);
    assert.ok(
        hubFallbacks.every(({ maxCharacters }) => maxCharacters === 18000),
    );
    assert.equal(result.requiredEvidencePending, false);
    assert.ok(
        result.gaps.includes(
            "reddit: fetched discovery evidence remains unresolved",
        ),
    );
    assert.equal(
        result.actions.filter(({ status }) => status === "searched").length,
        8,
    );
    assert.equal(
        result.sources.filter(({ status }) => status === "fetched").length,
        0,
    );
});

test("declining a blocked-page fallback preserves attempted coverage and still extracts fetched evidence", async () => {
    const f = fixture([]);
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        status:
            new URL(args.url).hostname === "www.reddit.com"
                ? "unavailable"
                : "fetched",
    });
    let extracted = false;
    f.services.extract = async (sources) => {
        extracted = true;
        assert.equal(sources.length, 4);
        assert.equal(
            sources.filter(({ status }) => status === "fetched").length,
            2,
        );
        return {
            discoveries: [],
            grades: [],
            gaps: ["Fixture identity unresolved"],
        };
    };
    f.services.control = async ({ stage, actions }) => ({
        action: actions.some(({ mode }) => mode === "exa")
            ? null
            : stage === "search"
              ? actions[0]
              : (actions.find(({ required }) => required) ??
                actions.find(({ kind }) => kind === "finish")),
    });
    const result = await prepareResearch({}, f.services);
    assert.equal(result.requiredEvidencePending, false);
    assert.equal(extracted, true);
    assert.equal(f.reads.length, 4);
    assert.ok(result.gaps.includes("Fixture identity unresolved"));
    assert.ok(
        result.gaps.some((gap) =>
            gap.startsWith("crawl: Jev could not select"),
        ),
    );
    assert.ok(
        result.gaps.includes(
            "reddit: fetched discovery evidence remains unresolved",
        ),
    );
});
