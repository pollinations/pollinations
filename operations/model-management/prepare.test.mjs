import assert from "node:assert/strict";
import test from "node:test";
import { parseLeads, prepareResearch } from "./prepare.mjs";

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

test("market discovery uses four platforms with no identity triage or Sol call", async () => {
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
    assert.equal(f.searches.length, 4);
    assert.equal(result.scopes.get("discovery").size, 4);
    assert.equal(f.triages.length, 0);
    assert.equal(f.reads.length, 4);
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
