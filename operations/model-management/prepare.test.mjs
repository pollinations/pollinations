import assert from "node:assert/strict";
import test from "node:test";
import {
    DISCOVERY_MODES,
    officialCandidates,
    parseLeads,
    prepareResearch,
} from "./prepare.mjs";

test("provider API documentation precedes optional model links inside the same crawl bound", async () => {
    for (const documentation of [
        "https://niche.example/docs",
        "https://docs.niche.example/guide",
    ]) {
        const f = fixture([
            {
                url: "https://niche.example/pricing",
                text: "Niche offers hosted inference.",
            },
        ]);
        delete f.services.triage;
        f.services.read = async (args) => {
            f.reads.push(args);
            return {
                id: `s${f.reads.length}`,
                url: args.url,
                status: "fetched",
                text: "Niche offers hosted inference.",
                links: args.url.endsWith("/pricing")
                    ? [
                          ...Array.from({ length: 10 }, (_, i) => ({
                              url: `https://models.example/checkpoint-${i}`,
                              text: `Model checkpoint ${i}`,
                          })),
                          {
                              url: documentation,
                              text: "Documentation",
                          },
                          {
                              url: "https://other.example/docs",
                              text: "Documentation",
                          },
                      ]
                    : [],
            };
        };
        const result = await prepareResearch({}, f.services);
        assert.ok(f.reads.some(({ url }) => url === documentation));
        assert.ok(
            result.actions.some(
                (action) =>
                    action.url === documentation &&
                    action.providerDocumentation &&
                    action.parentSourceId === "s1",
            ),
        );
        assert.ok(
            !f.reads.some(({ url }) => url === "https://other.example/docs"),
        );
        assert.ok(f.reads.length <= 9);
        assert.equal(result.requiredEvidencePending, false);
    }
});

test("two discovery runs read older deferred URLs and retain failed and skipped crawl receipts", async () => {
    const run = async (deferredSources = []) => {
        const f = fixture([]);
        let bucket = 0;
        f.services.search = async () =>
            JSON.stringify({
                results: Array.from({ length: 20 }, (_, index) => ({
                    url: `https://${discoveryHosts[bucket]}/run-${deferredSources.length ? 2 : 1}/${index}`,
                    title: `Literal title ${index}`,
                    text: `Literal snippet ${index}`,
                })).map((row, index, rows) => {
                    if (index === rows.length - 1) bucket++;
                    return row;
                }),
            });
        f.services.read = async (args) => {
            f.reads.push(args);
            return {
                id: `source-${f.reads.length}`,
                url: args.url,
                status: args.url.endsWith("/0") ? "unavailable" : "fetched",
                text: "Current page evidence",
                links: args.url.endsWith("/1")
                    ? Array.from({ length: 18 }, (_, index) => ({
                          url: `https://publisher.example.org/skipped-${index}`,
                          text: `Observed model link ${index}`,
                      }))
                    : [],
            };
        };
        f.services.control = async ({ stage, actions }) => ({
            action:
                stage === "search"
                    ? actions[0]
                    : (actions.find(
                          ({ required }) =>
                              required && actions[0].mode !== "exa",
                      ) ?? actions.find(({ kind }) => kind === "finish")),
            selectedProbability: 0.98,
            requestDigest: "f".repeat(64),
        });
        f.services.extract = async (sources) => {
            assert.ok(
                sources.every(({ text }) => text === "Current page evidence"),
            );
            return { gaps: [], discoveries: [], grades: [] };
        };
        return {
            result: await prepareResearch({ deferredSources }, f.services),
            reads: f.reads,
        };
    };
    const first = await run();
    const pending = first.result.unselectedLeads.find(
        ({ url }) => url === "https://reddit.com/run-1/2",
    );
    assert.equal(pending.title, "Literal title 2");
    assert.equal(pending.status, "pending");
    assert.deepEqual(pending.modes, ["reddit"]);
    assert.ok(
        first.result.unselectedLeads.some(
            ({ url, status, attempted }) =>
                url.endsWith("/0") && status === "unavailable" && attempted,
        ),
    );
    assert.ok(
        first.result.unselectedLeads.some(
            ({ url, sourceId }) => url.endsWith("skipped-17") && sourceId,
        ),
    );
    const second = await run(first.result.unselectedLeads);
    assert.ok(
        second.reads.some(({ url }) => url === pending.url),
        "Restored leads must receive a real current read",
    );
    assert.ok(second.reads.length <= 24);
    assert.ok(second.result.remainingDeferredCount > 0);
});

test("restored frontier rejects private or credential URLs, dedupes fragments and bounds overflow", async () => {
    const f = fixture([]);
    const deferredSources = [
        { url: "https://127.0.0.1/private" },
        { url: "https://10.0.0.1/private" },
        { url: "https://[::1]/private" },
        { url: "https://user:password@example.org/private" },
        { url: "https://example.org/private?access_token=secret" },
        {
            url: "https://publisher.example.org/real#one",
            title: "Observed title",
            text: "Observed snippet",
            modes: ["news"],
            scopes: ["discovery"],
            sourceId: "previous-source",
        },
        { url: "https://publisher.example.org/real#two" },
        ...Array.from({ length: 300 }, (_, index) => ({
            url: `https://publisher.example.org/${index}`,
        })),
    ];
    const result = await prepareResearch({ deferredSources }, f.services);
    assert.ok(f.reads.every(({ url }) => !/private/.test(url)));
    assert.equal(
        f.reads.filter(
            ({ url }) => url === "https://publisher.example.org/real",
        ).length,
        1,
    );
    const observed = result.leads.find(
        ({ url }) => url === "https://publisher.example.org/real",
    );
    assert.equal(observed.title, "Observed title");
    assert.equal(observed.sourceId, "previous-source");
    assert.ok(result.omittedCandidates > 0);
    assert.ok(result.unselectedLeads.length <= 256);
});

test("a saturated restored queue still reads all eight current platforms and required feeds", async () => {
    const f = fixture([]);
    let bucket = 0;
    f.services.search = async () =>
        JSON.stringify({
            results: [
                {
                    url: `https://${discoveryHosts[bucket++]}/current`,
                    text: "Observed current release",
                },
            ],
        });
    const result = await prepareResearch(
        {
            deferredSources: Array.from({ length: 256 }, (_, index) => ({
                url: `https://old.example.org/${index}`,
                title: `Observed old ${index}`,
                modes: [DISCOVERY_MODES[index % DISCOVERY_MODES.length]],
                scopes: ["discovery"],
            })),
        },
        f.services,
    );
    for (const host of discoveryHosts)
        assert.ok(
            f.reads.some(({ url }) => url === `https://${host}/current`),
            `${host}: current search lead must survive a restored same-mode backlog`,
        );
    assert.ok(
        f.reads.filter(({ url }) => new URL(url).hostname === "old.example.org")
            .length >= 2,
    );
    assert.ok(result.leads.some(({ modes }) => modes.includes("providers")));
    assert.equal(result.requiredEvidencePending, false);
    assert.ok(f.reads.length <= 24);
    assert.ok(result.omittedCandidates >= 7);
    assert.ok(result.unselectedLeads.length <= 256);
});

test("a current fetched redirect retires the requested deferred URL by its action source binding", async () => {
    const requested = "https://example.org/requested-release";
    const redirected = "https://example.org/canonical-release";
    const f = fixture([
        {
            url: requested,
            title: "Current observed release",
            text: "Current search snippet",
        },
    ]);
    f.services.read = async (args) => {
        f.reads.push(args);
        return {
            id: `source-${f.reads.length}`,
            url: args.url === requested ? redirected : args.url,
            status: "fetched",
            text: "Current fetched page",
        };
    };
    const result = await prepareResearch(
        {
            deferredSources: [
                {
                    url: requested,
                    modes: ["news"],
                    scopes: ["discovery"],
                    title: "Prior observed title",
                },
            ],
        },
        f.services,
    );
    const action = result.actions.find(
        ({ tool, url }) => tool === "fetch" && url === requested,
    );
    assert.equal(
        result.sources.find(({ id }) => id === action.sourceId).url,
        redirected,
    );
    assert.ok(
        !result.unselectedLeads.some(({ url }) => url === requested),
        "Completed redirect must not be retried forever",
    );
});

test("an unavailable redirected current read remains deferred despite prior fetched-looking fields", async () => {
    const requested = "https://example.org/unavailable-release";
    const f = fixture([{ url: requested, title: "Observed release" }]);
    f.services.read = async (args) => ({
        id: `source-${args.url}`,
        url: args.url === requested ? "https://example.org/redirect" : args.url,
        status: "unavailable",
        text: "",
    });
    const result = await prepareResearch(
        {
            deferredSources: [
                {
                    url: requested,
                    status: "fetched",
                    text: "Stale page cannot retire this lead",
                    modes: ["news"],
                },
            ],
        },
        f.services,
    );
    const pending = result.unselectedLeads.find(({ url }) => url === requested);
    assert.equal(pending.status, "unavailable");
    assert.equal(pending.attempted, true);
});

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

test("provider index followups use only checkpoints explicitly mapped by the source", async () => {
    const f = fixture([]);
    f.services.remainingPollen = () => 1;
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ id }) => id === "niche-0") ??
                  actions.find(({ id }) => id === "finish")),
    });
    await prepareResearch(
        {
            models: [
                { name: "maker/Alpha-v3", category: "text" },
                { name: "maker/Beta-v4", category: "text" },
            ],
            discoveryLeads: [
                {
                    name: "niche-host",
                    kind: "provider",
                    modelNames: ["maker/Beta-v4"],
                    sourceIds: ["index-source"],
                },
            ],
        },
        f.services,
    );
    const followup = f.searches.at(-1);
    assert.match(followup.query, /"niche-host".*"Beta-v4"/);
    assert.ok(!followup.query.includes("Alpha-v3"));
});

test("availability quotes prefer explicit serverless statements over an API page title", () => {
    const name = "qwen/qwen3-embedding-8b";
    const result = officialCandidates(
        [{ name, category: "embedding" }],
        [
            {
                id: "s1",
                status: "fetched",
                url: "https://fireworks.ai/models/example",
                text: "Qwen3 Embedding 8B API & Playground | Fireworks\nQwen3 Embedding 8B is available via Fireworks' serverless API, where you pay per token.",
            },
        ],
    );
    const quote = result.models[0].routes[0].claims.find(
        ({ kind }) => kind === "availability",
    ).quote;
    assert.match(quote, /available via Fireworks' serverless API/);
    assert.ok(!quote.includes("Playground"));
});

test("Jev can read same-origin API documentation before paying for a followup search", async () => {
    const f = fixture([
        { url: "https://niche.example/model", text: "Alpha-v3 model" },
    ]);
    f.services.remainingPollen = () => 1;
    f.services.read = async (args) => {
        f.reads.push(args);
        return {
            id: `s${f.reads.length}`,
            url: args.url,
            status: "fetched",
            text: args.url.endsWith("/api")
                ? "Alpha-v3 is available via serverless API inference."
                : "Alpha-v3 model",
            links: args.url.endsWith("/api")
                ? []
                : [
                      {
                          url: "https://niche.example/model/api",
                          text: "API documentation",
                      },
                      {
                          url: "https://other.example/api",
                          text: "API documentation",
                      },
                  ],
        };
    };
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ kind }) => kind === "read") ??
                  actions.find(({ kind }) => kind === "finish")),
    });
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3", category: "text" }] },
        f.services,
    );
    assert.equal(f.searches.length, 4);
    assert.ok(
        f.reads.some(({ url }) => url === "https://niche.example/model/api"),
    );
    assert.ok(!f.reads.some(({ url }) => url.includes("other.example")));
    assert.ok(
        result.actions.some(
            ({ parentSourceId, status }) =>
                parentSourceId === "s1" && status === "fetched",
        ),
    );
});

test("official provider documentation links may cross that provider's subdomains only", async () => {
    const f = fixture([
        {
            url: "https://fireworks.ai/models/Alpha-v3",
            text: "Alpha-v3 API model",
        },
    ]);
    f.services.read = async (args) => {
        f.reads.push(args);
        return {
            id: `s${f.reads.length}`,
            url: args.url,
            status: "fetched",
            text: "Alpha-v3 API model",
            links: args.url.includes("/models/")
                ? [
                      {
                          url: "https://docs.fireworks.ai/api-reference/Alpha-v3",
                          text: "API documentation",
                      },
                      {
                          url: "https://unrelated.example/api",
                          text: "API documentation",
                      },
                  ]
                : [],
        };
    };
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ kind }) => kind === "read") ??
                  actions.find(({ kind }) => kind === "finish")),
    });
    await prepareResearch(
        { models: [{ name: "maker/Alpha-v3", category: "text" }] },
        f.services,
    );
    assert.ok(
        f.reads.some(({ url }) => url.startsWith("https://docs.fireworks.ai/")),
    );
    assert.ok(
        !f.reads.some(({ url }) =>
            url.startsWith("https://unrelated.example/"),
        ),
    );
});

test("shared primary catalogs enter only exact matching groups and are not fetched again", async () => {
    const f = fixture([]);
    const source = {
        id: "shared",
        url: "https://fireworks.ai/catalog",
        status: "fetched",
        text: "Alpha-v3 is available through a serverless API.",
    };
    f.services.catalogSources = [source];
    const matched = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3", category: "text" }] },
        f.services,
    );
    const other = await prepareResearch(
        { models: [{ name: "maker/Alpha-v4", category: "text" }] },
        f.services,
    );
    assert.ok(matched.sources.includes(source));
    assert.ok(!other.sources.includes(source));
    assert.equal(f.reads.length, 0);
});

test("repeated exact primary pages preserve facts without repeating whole-page parsing", () => {
    let reads = 0;
    const text = `Alpha-v3 is available through a serverless API.
Prices per 1M tokens.
| Model | Input | Output |
| --- | --- | --- |
| Alpha-v3 | $0.20 | $0.40 |`;
    const source = {
        id: "s1",
        url: "https://fireworks.ai/pricing",
        status: "fetched",
        get text() {
            reads++;
            return text;
        },
    };
    const models = [{ name: "maker/Alpha-v3", category: "text" }];
    const single = officialCandidates(models, [source]);
    const singleReads = reads;
    reads = 0;
    const repeated = officialCandidates(models, Array(128).fill(source));
    assert.deepEqual(repeated, single);
    assert.ok(
        reads <= singleReads + 2 * 127,
        "Duplicate source pages must not repeat model and pricing scans",
    );
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

test("every unresolved checkpoint gets targeted research before finish, including primary reads after the batch read budget", async () => {
    const models = Array.from({ length: 8 }, (_, i) => ({
        name: `maker/Alpha-v${i}`,
        category: "text",
    }));
    const f = fixture([]);
    f.services.search = async (query) => {
        f.searches.push({ query });
        const exact = models.filter(({ name }) =>
            query.includes(JSON.stringify(name.split("/").at(-1))),
        );
        return JSON.stringify({
            results:
                exact.length === 1
                    ? [
                          {
                              url: `https://reddit.com/r/models/${exact[0].name.split("/").at(-1)}`,
                              text: exact[0].name,
                          },
                          {
                              url: `https://deepinfra.com/${exact[0].name}`,
                              text: `${exact[0].name} API pricing`,
                          },
                      ]
                    : Array.from({ length: 24 }, (_, i) => ({
                          url: `https://learn.microsoft.com/catalog/${i}`,
                          text: models.map(({ name }) => name).join(" "),
                      })),
        });
    };
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ required }) => required) ??
                  actions.find(({ kind }) => kind === "finish")),
    });
    const result = await prepareResearch({ models }, f.services);
    for (const { name } of models) {
        assert.ok(
            result.actions.some(
                ({ tool, models: named, required }) =>
                    tool === "search" &&
                    named.length === 1 &&
                    named[0] === name &&
                    required,
            ),
            `${name} needs its own targeted research attempt`,
        );
        assert.ok(
            f.reads.some(({ url }) => url === `https://deepinfra.com/${name}`),
            `${name} needs its returned primary provider read`,
        );
    }
    assert.ok(f.reads.length <= 40);
});

test("an unresolved mandatory followup choice retains partial coverage rather than reporting completion", async () => {
    const f = fixture([]);
    f.services.control = async ({ stage, actions }) => ({
        action: stage === "search" ? actions[0] : undefined,
    });
    const result = await prepareResearch(
        { models: [{ name: "maker/Alpha-v3", category: "text" }] },
        f.services,
    );
    assert.equal(f.searches.length, 4);
    assert.equal(result.requiredEvidencePending, true);
    assert.ok(result.gaps.some((gap) => gap.includes("followup")));
});

test("optional provider searches cannot consume another model's required targeted slot", async () => {
    const models = Array.from({ length: 8 }, (_, i) => ({
        name: `maker/Alpha-v${i}`,
        category: "text",
    }));
    const f = fixture([]);
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : (actions.find(({ id }) => id.startsWith("niche-")) ??
                  actions.find(({ required }) => required) ??
                  actions.find(({ kind }) => kind === "finish")),
    });
    const result = await prepareResearch(
        {
            models,
            discoveryLeads: Array.from({ length: 6 }, (_, i) => ({
                name: `provider-${i}`,
                kind: "provider",
            })),
        },
        f.services,
    );
    for (const { name } of models)
        assert.ok(
            result.actions.some(
                (a) =>
                    a.tool === "search" && a.required && a.models[0] === name,
            ),
        );
    assert.ok(f.searches.length <= 14);
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
    assert.ok(result.gaps.some((gap) => gap.includes("deferred frontier")));
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
        f.searches
            .slice(0, 7)
            .every(({ query }) =>
                query.includes(new Date().toISOString().slice(0, 7)),
            ),
    );
    assert.match(f.searches[7].query, /independent providers official pricing/);
    assert.ok(
        !f.searches[7].query.includes(new Date().toISOString().slice(0, 7)),
        "Current-month filtering must not hide established niche providers",
    );
    assert.equal(f.triages.length, 0);
    assert.equal(f.reads.length, 8);
    assert.equal(result.requiredEvidencePending, false);
});

test("discovery preserves every safe result and eight-mode diversity within sixteen selected leads", async () => {
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
    assert.equal(result.unselectedLeads.length, 144);
    assert.equal(result.omittedCandidates, 0);
    assert.equal(
        result.unselectedLeads.at(-1).url,
        "https://provider.example.org/19",
    );
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
        [
            "http",
            "http",
            "http",
            "http",
            "http",
            "dynamic",
            "dynamic",
            "dynamic",
            "dynamic",
            "exa",
            "exa",
            "exa",
            "exa",
        ],
    );
    assert.equal(result.sources[0].status, "unavailable");
    assert.equal(result.sources[9].status, "fetched");
    assert.ok(f.reads.length <= 24);
    assert.equal(result.requiredEvidencePending, false);
    for (const { url, mode } of f.reads.filter(({ mode }) => mode === "exa")) {
        assert.equal(mode, "exa");
        const local = f.reads.filter((read) => read.url === url);
        assert.deepEqual(
            local.map((read) => read.mode),
            ["http", "dynamic", "exa"],
        );
    }
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
    assert.equal(result.unselectedLeads.length, 24);
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
    assert.equal(result.omittedCandidates, 0);
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
    assert.deepEqual(wiki.modes, ["web", "news", "providers"]);
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
            "https://www.reddit.com/r/LocalLLaMA/.rss",
            "https://www.reddit.com/r/StableDiffusion/.rss",
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

test("optional crawl abstention preserves completed feed coverage and continues gap analysis", async () => {
    const f = fixture([]);
    const read = f.services.read;
    f.services.read = async (args) => ({
        ...(await read(args)),
        links: [
            {
                url: "https://publisher.example.org/new-model",
                text: "Model release",
            },
        ],
    });
    f.services.control = async ({ stage, actions }) => ({
        action:
            stage === "search"
                ? actions[0]
                : actions.find(({ required }) => required),
    });
    const result = await prepareResearch({}, f.services);
    assert.equal(f.reads.length, 4);
    assert.equal(result.requiredEvidencePending, false);
    assert.ok(
        result.gaps.includes(
            "quora: fetched discovery evidence remains unresolved",
        ),
    );
    assert.ok(result.gaps.some((gap) => gap.includes("Jev could not select")));
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
            args.url.endsWith("/.rss") && args.mode === "http"
                ? "unavailable"
                : "fetched",
        url:
            args.mode === "dynamic"
                ? args.url.replace("/.rss", "/canonical/.rss")
                : args.url,
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
    assert.equal(f.reads.filter(({ mode }) => mode === "dynamic").length, 2);
    assert.equal(f.reads.filter(({ mode }) => mode === "exa").length, 0);
    assert.equal(f.reads.length, 26);
    for (const action of result.actions.filter(
        ({ mode }) => mode === "dynamic",
    )) {
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
                    ({ url, mode }) => url === action.url && mode === "dynamic",
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
        assert.equal(sources.length, 6);
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
    assert.equal(f.reads.length, 6);
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
