import assert from "node:assert/strict";

test("provider discovery audits include literal API evidence after long pricing tables", async () => {
    const api =
        "InferHub offers an OpenAI-compatible inference API for these models.";
    const text = `InferHub pricing and models. ${"Table row. ".repeat(400)}${api}`;
    let checked = 0;
    await auditEvidence(
        {
            routes: [],
            discoveries: [
                {
                    name: "InferHub",
                    kind: "provider",
                    reason: "Source identifies a provider research lead; popularity, release recency, pricing and API availability require verification.",
                    sourceIds: ["s1"],
                },
            ],
            gaps: [],
        },
        null,
        [
            {
                id: "s1",
                url: "https://inferhub.dev/pricing",
                status: "fetched",
                text,
            },
        ],
        async (payload) => {
            const [item] = payload.state.items;
            assert.ok(item.excerpt.includes(api));
            assert.match(
                item.claim,
                /document advertises inference API access or an API marketplace/,
            );
            assert.ok(
                item.excerpt.includes(
                    "Source URL: https://inferhub.dev/pricing",
                ),
            );
            assert.ok(item.excerpt.length <= 1600);
            checked++;
            return { grades: [], requestDigest: "test" };
        },
    );
    assert.equal(checked, 1);
});

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import timers from "node:timers/promises";
import { EVIDENCE_CHECKS } from "./calibration.mjs";
import { discoveryLeadReason } from "./discovery.mjs";
import { JEV_ENDPOINT, JEV_MODEL, validateClaimAudit } from "./jev.mjs";
import { DISCOVERY_MODES, officialCandidates } from "./prepare.mjs";
import { PROVIDER_INDEX_URL } from "./provider-index.mjs";
import {
    assessGroup,
    auditEvidence,
    budgetUsed,
    main,
    research,
    sourcePackets,
} from "./researcher.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

test("provider documentation is kept before lengthy marketing excerpts in a bounded audit", async () => {
    const api = "InferHub offers an OpenAI-compatible inference API.";
    let audited = 0;
    await auditEvidence(
        {
            routes: [],
            discoveries: [
                {
                    name: "InferHub",
                    kind: "provider",
                    reason: discoveryLeadReason("provider"),
                    sourceIds: ["pricing", "docs"],
                },
            ],
            gaps: [],
        },
        null,
        [
            {
                id: "pricing",
                url: "https://inferhub.dev/pricing",
                status: "fetched",
                text: `InferHub prices. ${"Price row. ".repeat(400)}`,
            },
            {
                id: "docs",
                url: "https://docs.inferhub.dev/guide",
                status: "fetched",
                text: `InferHub documentation. ${"Navigation. ".repeat(400)}${api}`,
            },
        ],
        async (payload) => {
            const [item] = payload.state.items;
            assert.ok(
                item.excerpt.startsWith(
                    "Source URL: https://docs.inferhub.dev/guide",
                ),
            );
            assert.ok(item.excerpt.includes(api));
            assert.ok(item.excerpt.length <= 1600);
            audited++;
            return { grades: [], requestDigest: "test" };
        },
    );
    assert.equal(audited, 1);
});
test("primary serverless catalog retains exact API-column prices and availability through assessment", () => {
    const model = { name: "qwen/qwen3.7-max", category: "text" };
    const text = `Serverless models are the fastest way to run inference on Together.
You call any supported model through a shared per-token API, with no provisioning, no replicas to size, and no minimum cost.
## Chat models
| Organization | Model name | API model string | Context length | Input pricing (per 1M tokens) | Cached input pricing (per 1M tokens) | Output pricing (per 1M tokens) | Quantization | Function calling | Structured outputs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Qwen | Qwen3.7 Max | Qwen/Qwen3.7-Max | - | $2.50 | $0.50 | $7.50 | - | Yes | Yes |`;
    const source = {
        id: "s1",
        url: "https://docs.together.ai/docs/serverless/models",
        status: "fetched",
        text,
        digest: hash(text),
        pageDigest: hash(text),
        method: "scrapling-http",
        extractionVersion: 2,
    };
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set(["web:exa:challenge:exact checkpoint"]),
        ]),
    );
    const proposal = officialCandidates([model], [source]);
    const result = assessGroup(
        proposal,
        [source],
        new Map([[model.name, scopes]]),
        [model],
        [model],
    );
    assert.equal(result.models[0].routes.length, 1);
    const route = result.models[0].routes[0];
    assert.equal(route.pricing.input, 2.5);
    assert.equal(route.pricing.output, 7.5);
    assert.equal(route.availabilitySupported, true);
    assert.equal(route.runtimeVerified, false);
    assert.equal(route.capabilitiesMatch, null);
    for (const changed of [
        { ...source, url: "https://unrelated.example/catalog" },
        {
            ...source,
            text: text.replace("## Chat models", "## Dedicated models"),
        },
        {
            ...source,
            text: text.replace(
                "You call any supported model through a shared per-token API, with no provisioning, no replicas to size, and no minimum cost.",
                "",
            ),
        },
    ]) {
        const candidate = officialCandidates([model], [changed]).models[0]
            .routes[0];
        assert.notEqual(
            candidate?.available,
            true,
            "A primary scoped serverless table and API statement are both required",
        );
    }
});
test("prepared discovery preserves separate exact spans and every accepted lead when Sol returns none", async () => {
    const text =
        "navigation\n".repeat(500) +
        Array.from(
            { length: 23 },
            (_, index) => `publisher/lead-${index} is a research lead.\n`,
        ).join("unrelated page section\n");
    const source = {
        id: "s1",
        url: "https://example.org/catalog",
        status: "fetched",
        method: "scrapling-http",
        text,
        digest: hash(text),
        pageDigest: hash(text),
        extractionVersion: 2,
    };
    const discoveries = Array.from({ length: 23 }, (_, index) => {
        const name = `publisher/lead-${index}`;
        const quote = `${name} is a research lead.`;
        const start = text.indexOf(quote);
        return {
            name,
            kind: "model",
            reason: "Source identifies a model research lead",
            sourceIds: [source.id],
            extraction: {
                id: `entity-${index}`,
                quote,
                start,
                end: start + quote.length,
                requestDigest: hash(quote),
            },
        };
    });
    const unread = {
        ...source,
        id: "s2",
        url: "https://example.org/unresolved",
    };
    const packets = sourcePackets([source, unread], [], discoveries);
    assert.equal(packets.length, 2);
    assert.equal(packets[0].spans.length, 23);
    assert.equal(packets[1].spans.length, 0);
    assert.match(packets[1].reread, /mode=saved/);
    assert.equal(packets[0].sourceDigest, hash(text));
    assert.equal(packets[0].pageDigest, hash(text));
    assert.equal(packets[0].excerpt, undefined);
    for (const span of packets[0].spans) {
        assert.equal(text.slice(span.start, span.end), span.quote);
        assert.equal(span.requestDigest, hash(span.quote));
    }
    assert.throws(
        () =>
            sourcePackets(
                [source],
                [],
                [
                    {
                        ...discoveries[0],
                        extraction: {
                            ...discoveries[0].extraction,
                            quote: "invented",
                        },
                    },
                ],
            ),
        /exact saved source span/,
    );
    const inventory = [
        { name: "publisher/official", aliases: ["official-alias"] },
    ];
    let captured;
    const output = await research(
        { task: "Resolve named identity ambiguity" },
        {
            prepared: {
                sources: [source, unread],
                scopes: new Map([
                    [
                        "discovery",
                        new Set(
                            DISCOVERY_MODES.map(
                                (mode) =>
                                    `${mode}:exa:challenge:research leads`,
                            ),
                        ),
                    ],
                ]),
                plans: [{ questions: ["Resolve named identity ambiguity"] }],
                actions: [],
                leads: [],
                gaps: ["Resolve ambiguous provider identity"],
                extraction: {
                    discoveries,
                    gaps: ["Two literal entities remain ambiguous"],
                },
                reasoningAction: { task: "Resolve named identity ambiguity" },
            },
            infer: async (messages) => {
                captured = JSON.parse(messages[1].content);
                return {
                    tool_calls: [
                        {
                            id: "verify",
                            type: "function",
                            function: {
                                name: "research",
                                arguments: JSON.stringify({
                                    action: "verify",
                                    routes: [],
                                    discoveries: [],
                                    gaps: ["Provider identity remains unknown"],
                                }),
                            },
                        },
                    ],
                };
            },
            auditClaims: async (proposal) => proposal,
        },
        inventory,
        1,
    );
    assert.equal(output.discoveries.length, 23, output.reason);
    assert.deepEqual(
        output.discoveries.map(({ name }) => name),
        discoveries.map(({ name }) => name),
    );
    assert.deepEqual(captured.officialModelInventory, [
        ["publisher/official", ["official-alias"]],
    ]);
    assert.equal(captured.preparation.extractedDiscoveries.length, 23);
    assert.deepEqual(
        captured.preparation.sources,
        JSON.parse(JSON.stringify(packets)),
    );
    assert.deepEqual(captured.preparation.gaps, [
        "Resolve ambiguous provider identity",
        "Two literal entities remain ambiguous",
    ]);
    assert.throws(
        () =>
            sourcePackets(
                [source],
                [],
                [{ ...discoveries[0], sourceIds: "s1" }],
            ),
        /invalid source IDs or quote/,
    );
    assert.throws(
        () =>
            sourcePackets(
                [source],
                [],
                [
                    {
                        ...discoveries[0],
                        extraction: {
                            ...discoveries[0].extraction,
                            end: text.length + 1,
                            quote: text.slice(discoveries[0].extraction.start),
                        },
                    },
                ],
            ),
        /exact saved source span/,
    );
    const distinctSources = discoveries.map((_item, index) => ({
        ...source,
        id: `cost-${index}`,
        url: `https://example.org/lead-${index}`,
    }));
    const distinctDiscoveries = discoveries.map((item, index) => ({
        ...item,
        sourceIds: [`cost-${index}`],
    }));
    const compactBytes = Buffer.byteLength(
        JSON.stringify(sourcePackets(distinctSources, [], distinctDiscoveries)),
    );
    const legacyBytes = Buffer.byteLength(
        JSON.stringify(sourcePackets(distinctSources)),
    );
    assert.ok(
        compactBytes < legacyBytes / 2,
        `${compactBytes} vs ${legacyBytes}`,
    );
});

test("offline official corpus replay recovers four s431 workload prices without Sol or searches", async (t) => {
    let corpus;
    try {
        corpus = JSON.parse(
            await readFile(
                new URL(
                    "../../temp/full-catalog-compact-e2e/research.json",
                    import.meta.url,
                ),
                "utf8",
            ),
        );
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        t.skip("Saved offline catalog corpus not present");
        return;
    }
    const expected = new Map([
        ["openai/gpt-5.4-nano", [0.2, 1.25]],
        ["openai/gpt-5.4-mini", [0.75, 4.5]],
        ["openai/gpt-4o-mini", [0.15, 0.6]],
        ["openai/gpt-5-nano", [0.05, 0.4]],
    ]);
    const models = corpus.models.filter(({ name }) => expected.has(name));
    assert.equal(models.length, 4);
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set([`web:exa:challenge:cached ${scope}`]),
        ]),
    );
    let networkCalls = 0;
    const forbidNetwork = async () => {
        networkCalls++;
        throw new Error("Offline replay performed network work");
    };
    const output = await research(
        { models },
        {
            prepared: {
                sources: [corpus.sources.find(({ id }) => id === "s431")],
                scopes,
                coverage: new Map(models.map(({ name }) => [name, scopes])),
                plans: [{ questions: ["Replay saved exact source evidence"] }],
                actions: [],
                leads: [],
                gaps: [],
                unselectedLeads: [],
                unselectedLeadIds: [],
                triage: {},
            },
            infer: forbidNetwork,
            search: forbidNetwork,
            auditClaims: (proposal, supplied, sources) =>
                auditEvidence(proposal, supplied, sources, forbidNetwork),
        },
        corpus.models,
    );
    assert.equal(networkCalls, 0);
    for (const row of output.models) {
        const route = row.routes.find(
            ({ provider }) => provider === "openai.com",
        );
        assert.ok(route, row.name);
        assert.deepEqual(
            [route.pricing.input, route.pricing.output],
            expected.get(row.name),
        );
        assert.ok(route.pricing.conditions.includes("short context"));
        assert.equal(route.available, null);
        assert.equal(route.capabilitiesMatch, null);
        assert.equal(route.creditEligibility, "unknown");
        assert.equal(route.recommendation, undefined);
        assert.equal(row.recommendation, null);
        assert.ok(
            route.claims.some(
                ({ kind, sourceId }) => kind === "price" && sourceId === "s431",
            ),
        );
        for (const fragment of route.priceEvidence.evidence)
            assert.equal(
                output.sources[0].text.slice(fragment.start, fragment.end),
                fragment.quote,
            );
    }
    assert.match(output.auditDigest, /^[a-f0-9]{64}$/);
});

test("official formatting-equivalent checkpoint retains exact source identity and prices without accepting a suffix", () => {
    const model = { name: "openai/gpt-5.4-mini", category: "text" };
    const text =
        "Prices per 1M tokens (USD).\n| Model | Input | Output |\n| --- | --- | --- |\n| GPT 5.4 mini | $0.75 | $4.50 |\n| GPT 5.4 mini preview | $0.01 | $0.02 |";
    const sources = [
        {
            id: "s1",
            status: "fetched",
            url: "https://openai.com/pricing",
            text,
        },
    ];
    const proposal = officialCandidates([model], sources);
    assert.equal(proposal.models[0].routes[0].upstreamModel, "GPT 5.4 mini");
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set(["web:exa:challenge:exact checkpoint"]),
        ]),
    );
    const result = assessGroup(
        proposal,
        sources,
        new Map([[model.name, scopes]]),
        [model],
        [model],
    );
    const route = result.models[0].routes[0];
    assert.equal(route.identitySupported, true);
    assert.deepEqual([route.pricing.input, route.pricing.output], [0.75, 4.5]);
    assert.ok(
        route.priceEvidence.evidence.every(
            ({ quote, start, end }) => text.slice(start, end) === quote,
        ),
    );
});

test("catalog aliases cannot prove a sibling checkpoint route identity", () => {
    const model = {
        name: "moonshotai/kimi-k2.7-code",
        category: "text",
        aliases: ["kimi-k2.7"],
    };
    const source = {
        id: "alias",
        url: "https://openai.com/models",
        status: "fetched",
        text: "kimi-k2.7 is available through a managed API.",
    };
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set(["web:exa:challenge:exact checkpoint"]),
        ]),
    );
    const proposal = {
        routes: [],
        discoveries: [],
        gaps: [],
        models: [
            {
                name: model.name,
                discoveries: [],
                gaps: [],
                routes: [
                    {
                        provider: "openai.com",
                        providerWebsite: "https://openai.com",
                        upstreamModel: "kimi-k2.7",
                        exactMatch: true,
                        available: true,
                        capabilitiesMatch: null,
                        creditEligibility: "unknown",
                        pricing: {
                            currency: "USD",
                            unit: "unknown",
                            input: null,
                            output: null,
                        },
                        claims: [
                            {
                                kind: "identity",
                                sourceId: source.id,
                                quote: source.text,
                            },
                        ],
                        notes: "Sibling alias evidence",
                    },
                ],
            },
        ],
    };
    const result = assessGroup(
        proposal,
        [source],
        new Map([[model.name, scopes]]),
        [model],
        [model],
    );
    assert.equal(result.models[0].routes[0].identitySupported, false);
    assert.equal(result.models[0].recommendation, null);
    assert.equal(
        officialCandidates([model], [source]).models[0].routes.length,
        0,
    );
});

test("official assessment retains actual Fireworks ordered Standard workload prices as contiguous claims", () => {
    // Exact descriptor and rows copied from the fetched Fireworks serverless pricing page.
    const text = `## Text and vision models
Per-model pricing for headline models. Fast variants appear as adjacent rows. In each Standard or Priority cell, prices are input / cached input / output (USD per 1M tokens), in that order.
| Model | Standard | Priority |
| --- | --- | --- |
| Kimi K3 | $3.00 / $0.30 / $15.00 | $3.75 / $0.375 / $18.75 |
| Kimi K3 Fast | $4.50 / $0.45 / $22.50 | — |
| GLM 5.3 Flash | $0.15 / $0.03 / $0.50 | $0.1875 / $0.0375 / $0.625 |
| GLM 5.3 | $1.40 / $0.26 / $4.40 | $1.75 / $0.325 / $5.50 |`;
    const models = [
        { name: "moonshotai/kimi-k3", category: "text" },
        { name: "z-ai/glm-5.3", category: "text" },
    ];
    const source = {
        id: "fireworks",
        url: "https://docs.fireworks.ai/serverless/pricing",
        status: "fetched",
        text,
    };
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set(["web:exa:challenge:exact checkpoint"]),
        ]),
    );
    const sources = [
        {
            ...source,
            id: "model-api",
            url: "https://fireworks.ai/models",
            text: "Kimi K3 API & Playground | Fireworks\nGLM 5.3 API & Playground | Fireworks",
        },
        source,
    ];
    const proposal = officialCandidates(models, sources);
    const result = assessGroup(
        proposal,
        sources,
        new Map(models.map(({ name }) => [name, scopes])),
        models,
        models,
    );
    for (const [index, expected] of [
        [0, [3, 15]],
        [1, [1.4, 4.4]],
    ]) {
        const route = result.models[index].routes[0];
        assert.equal(route.provider, "fireworks");
        assert.equal(route.identitySupported, true);
        assert.deepEqual([route.pricing.input, route.pricing.output], expected);
        assert.deepEqual(route.pricing.conditions, ["standard"]);
        const claims = route.claims.filter(({ kind }) => kind === "price");
        assert.ok(
            claims.length > 0,
            "Short numeric cells must retain a complete row claim",
        );
        for (const claim of claims) {
            assert.ok(text.includes(claim.quote));
            assert.ok(
                claim.quote.length >= 8 &&
                    claim.quote.split(/\s+/).length <= 25,
            );
        }
        for (const fragment of route.priceEvidence.evidence)
            assert.equal(
                text.slice(fragment.start, fragment.end),
                fragment.quote,
            );
        assert.equal(route.available, true);
        assert.equal(route.availabilitySupported, true);
        assert.equal(result.models[index].recommendation.provider, "fireworks");
        assert.equal(
            result.models[index].recommendation.status,
            "requires-account-and-route-verification",
        );
        assert.equal(route.capabilitiesMatch, null);
        assert.equal(route.runtimeVerified, false);
    }
});

test("formatted Fireworks Qwen availability reaches native semantic grading and a native veto remains authoritative", async () => {
    const model = { name: "Qwen/Qwen3-Embedding-8B", category: "embedding" };
    const text =
        "# Qwen3 Embedding 8B\nQwen3 Embedding 8B is available via Fireworks' serverless API, where you pay per token.\nEmbeddings\nQwen3 Embedding 8B\n$0.010\n/ 1M tokens";
    const source = {
        id: "qwen",
        url: "https://fireworks.ai/models/qwen3-embedding-8b",
        status: "fetched",
        text,
    };
    const scopes = new Map(
        ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
            scope,
            new Set(["web:exa:challenge:exact checkpoint"]),
        ]),
    );
    const coverage = new Map([[model.name, scopes]]);
    const proposal = officialCandidates([model], [source]);
    const first = assessGroup(proposal, [source], coverage, [model], [model]);
    assert.equal(first.models[0].routes[0].availabilitySupported, true);
    assert.equal(first.models[0].routes[0].identitySupported, true);
    let decisions = 0;
    const audited = await auditEvidence(
        { ...proposal, ...first },
        [model],
        [source],
        async (payload) => {
            decisions++;
            assert.ok(payload.state.items[0].claim.includes(model.name));
            assert.ok(
                payload.state.items[0].excerpt.includes(
                    "Fireworks' serverless API",
                ),
            );
            return {
                ...validateClaimAudit(
                    payload,
                    nativeResponse(payload, "insufficient"),
                ),
                requestDigest: "c".repeat(64),
            };
        },
    );
    const final = assessGroup(audited, [source], coverage, [model], [model]);
    assert.equal(decisions, 1);
    assert.equal(final.models[0].routes[0].available, null);
    assert.equal(final.models[0].routes[0].pricing.input, 0.01);
    assert.equal(final.models[0].recommendation, null);
});

test("official assembly preserves valid models alongside malformed URLs, suffix mismatches and aggregator leads", () => {
    const models = [
        { name: "openai/gpt-5.4-mini", category: "text" },
        { name: "openai/gpt-5.4-nano", category: "text" },
    ];
    const sources = [
        {
            id: "bad",
            url: "not a URL",
            status: "fetched",
            text: "gpt-5.4-mini",
        },
        {
            id: "suffix",
            url: "https://openai.com/models",
            status: "fetched",
            text: "gpt-5.4-mini-2026 API is available",
        },
        {
            id: "aggregate",
            url: "https://reference.example/models",
            status: "fetched",
            text: "gpt-5.4-mini is a popular checkpoint",
        },
        {
            id: "weights",
            url: "https://niche.example/models",
            status: "fetched",
            text: "gpt-5.4-mini weights are available for dedicated inference and download",
        },
        {
            id: "valid",
            url: "https://niche.example/api",
            status: "fetched",
            text: "gpt-5.4-nano is available through our managed API.",
        },
    ];
    const candidate = officialCandidates(models, sources);
    assert.equal(candidate.models.length, 2);
    assert.equal(candidate.models[0].routes.length, 0);
    assert.ok(
        candidate.models[0].gaps.some((gap) => gap.includes("aggregate")),
    );
    assert.equal(candidate.models[1].routes[0].available, true);
    assert.equal(candidate.models[1].routes[0].capabilitiesMatch, null);
    for (const row of candidate.models)
        for (const route of row.routes)
            for (const claim of route.claims) {
                assert.ok(
                    sources
                        .find(({ id }) => id === claim.sourceId)
                        .text.includes(claim.quote),
                );
                assert.ok(
                    claim.quote.length >= 8 &&
                        claim.quote.split(/\s+/).length <= 25,
                );
            }
});

test("availability audit includes distant exact-checkpoint API examples instead of navigation boilerplate", async () => {
    const model = { name: "qwen/qwen3-embedding-8b", category: "embedding" };
    const text =
        "Qwen3 Embedding 8B API - Documentation - DeepInfra\n" +
        "navigation\n".repeat(200) +
        '\n# Qwen3-Embedding-8B\n### OpenAI-compatible HTTP API\nDeepInfra supports the OpenAI embeddings API.\ncurl "https://api.deepinfra.com/v1/openai/embeddings"\n"model": "Qwen/Qwen3-Embedding-8B"';
    const source = {
        id: "api",
        status: "fetched",
        url: "https://deepinfra.com/Qwen/Qwen3-Embedding-8B/api",
        text,
    };
    const initial = assessGroup(
        officialCandidates([model], [source]),
        [source],
        new Map(),
        [model],
        [model],
        false,
    );
    let calls = 0;
    await auditEvidence(initial, [model], [source], async (payload) => {
        calls++;
        const excerpt = payload.state.items[0].excerpt;
        assert.match(excerpt, /OpenAI-compatible HTTP API/);
        assert.match(excerpt, /api\.deepinfra\.com\/v1\/openai\/embeddings/);
        assert.match(excerpt, /"model": "Qwen\/Qwen3-Embedding-8B"/);
        assert.ok(excerpt.length <= 1600);
        return validateClaimAudit(payload, nativeResponse(payload));
    });
    assert.equal(calls, 1);
});
test("discovery identity audits do not require sources to prove the researcher's investigative intent", async () => {
    const reason = discoveryLeadReason("model");
    const source = {
        id: "discovery-source",
        status: "fetched",
        url: "https://models.example/new-model",
        text: "publisher/new-model is a text generation model with downloadable weights.",
    };
    const proposal = {
        discoveries: [
            {
                name: "publisher/new-model",
                kind: "model",
                sourceIds: [source.id],
                reason,
            },
        ],
        gaps: [],
    };
    const result = await auditEvidence(
        proposal,
        null,
        [source],
        async (payload) => {
            assert.ok(!payload.state.items[0].claim.includes(reason));
            assert.equal(
                payload.state.items[0].claim,
                "The source identifies publisher/new-model as a model.",
            );
            assert.ok(payload.state.items[0].excerpt.includes(source.url));
            assert.match(
                payload.state.items[0].claim,
                /publisher\/new-model.*model/,
            );
            return validateClaimAudit(payload, nativeResponse(payload));
        },
    );
    assert.equal(result.discoveries.length, 1);
    assert.equal(result.discoveries[0].reason, reason);
});

test("availability audits retain literal quotes from every supplied source", async () => {
    const model = { name: "qwen/qwen3-embedding-8b", category: "embedding" };
    const quotes = [
        "Qwen3-Embedding-8B is available through serverless inference.",
        "DeepInfra serves Qwen3-Embedding-8B through an OpenAI-compatible hosted API.",
    ];
    const sources = quotes.map((quote, index) => ({
        id: `api-${index}`,
        status: "fetched",
        url: `https://deepinfra.com/Qwen/Qwen3-Embedding-8B/${index ? "details" : "api"}`,
        text: `Qwen3-Embedding-8B\n${"navigation ".repeat(250)}\n${quote}\n${"details ".repeat(250)}\nOpenAI-compatible HTTP API curl https://api.deepinfra.com/v1/openai/embeddings model Qwen/Qwen3-Embedding-8B`,
    }));
    const initial = assessGroup(
        officialCandidates([model], sources),
        sources,
        new Map(),
        [model],
        [model],
        false,
    );
    assert.equal(
        initial.models[0].routes[0].claims.filter(
            ({ kind }) => kind === "availability",
        ).length,
        2,
    );
    let calls = 0;
    await auditEvidence(initial, [model], sources, async (payload) => {
        calls++;
        const item = payload.state.items.find(({ id }) =>
            id.endsWith(":availability"),
        );
        for (const quote of quotes)
            assert.ok(
                item.excerpt.includes(quote),
                "A known literal API quote was lost",
            );
        assert.ok(item.excerpt.length <= 1600);
        assert.ok(
            !item.claim.includes("account access"),
            "Account access is outside the document-offering claim",
        );
        return validateClaimAudit(payload, nativeResponse(payload));
    });
    assert.equal(calls, 1);
});

test("compact source windows preserve distant model evidence and exact table fragments", () => {
    const text =
        "navigation\n".repeat(550) +
        "Prices per 1M tokens (USD).\n| Model | Input | Output |\n| --- | --- | --- |\n| model-1 | $0.20 | $1.25 |\nmodel-2 availability details";
    const base = {
        url: "https://1.1.1.1/catalog",
        status: "fetched",
        text,
        digest: hash(text),
        focusMatched: true,
    };
    const packets = sourcePackets(
        [
            { ...base, id: "s1", focus: "model-1" },
            { ...base, id: "s2", focus: "model-2" },
            { ...base, id: "s3", focus: "model-1" },
        ],
        [{ name: "publisher/model-1", category: "text" }],
    );
    assert.equal(packets.length, 2);
    assert.ok(packets[0].excerptStart > 500);
    assert.match(packets[0].excerpt, /model-1/);
    assert.match(packets[1].excerpt, /model-2/);
    assert.equal(packets[0].sourceDigest, base.digest);
    assert.equal(packets[0].priceTables[0].input, 0.2);
    assert.equal(packets[0].priceTables[0].output, 1.25);
    assert.ok(
        packets[0].priceTables[0].evidence.every(
            ({ quote, start, end }) => text.slice(start, end) === quote,
        ),
    );
    assert.equal(packets[1].priceTables.length, 0);
    assert.ok(packets.every(({ excerpt }) => excerpt.length <= 1600));
});
const api = "https://gen.pollinations.ai";
const url = "https://1.1.1.1/fixture";
const model = {
    name: "fixture-publisher/fixture-embedding-8b",
    category: "embedding",
    community: false,
    input_modalities: ["text"],
    output_modalities: ["embedding"],
};
const sol = {
    name: "openai/gpt-6.1-sol",
    category: "text",
    community: false,
    paid_only: false,
    pricing: { promptTextTokens: 2e-6, completionTextTokens: 1e-5 },
};
const jev = {
    name: JEV_MODEL,
    category: "text",
    community: false,
    paid_only: false,
    pricing: { currency: "pollen", promptTextTokens: 4.431e-8 },
};
const text = `${model.name}
fixture-embedding-8b is available now through a managed serverless API.
fixture-embedding-8b accepts text input and returns embedding vectors.
Embeddings
fixture-publisher/
fixture-embedding-8b
$0.010
/ 1M tokens`;
const python = process.env.PYTHON ?? "python";
const available =
    spawnSync(python, ["-c", "import scrapling"], {
        env: process.env,
        encoding: "utf8",
    }).status === 0;

for (const shape of ["successful", "blocked"])
    test(
        `main restores ${shape} discovery frontier before reading current evidence`,
        { skip: !available && "Python with Scrapling unavailable" },
        async (t) => {
            const { out, env } = await fixture(t);
            delete env.MODELS;
            const deferredUrl = "https://example.org/deferred-observed-release";
            const deferred = {
                url: deferredUrl,
                title: "Original observed title",
                text: "Stale snippet must not be fetched evidence",
                modes: ["news"],
                scopes: ["discovery"],
                sourceId: "old-source",
            };
            const previousPath = join(out, "previous.json");
            await writeFile(
                previousPath,
                JSON.stringify({
                    discovery:
                        shape === "successful"
                            ? {
                                  status: "researched",
                                  preparation: { unselectedLeads: [deferred] },
                              }
                            : {
                                  status: "blocked",
                                  unselectedLeads: [deferred],
                              },
                }),
            );
            const currentText =
                "Current publisher release text with no model identity";
            await writeFile(
                join(out, "pages", `${hash(deferredUrl)}.json`),
                JSON.stringify({
                    requestedUrl: deferredUrl,
                    url: deferredUrl,
                    text: currentText,
                    pageDigest: hash(currentText),
                    extractionVersion: 2,
                    fetchedAt: new Date().toISOString(),
                    links: [],
                }),
            );
            network(t, [sol, jev], { marketFinish: true });
            const report = await main({
                ...env,
                PREVIOUS_RESEARCH: previousPath,
            });
            const source = report.sources.find(
                ({ url }) => url === deferredUrl,
            );
            assert.ok(
                source,
                `Deferred URL must receive a current page read before discovery completes: ${report.discovery.reason}`,
            );
            assert.equal(source.status, "fetched");
            assert.equal(source.text, currentText);
            const lead = report.discovery.preparation.leads.find(
                ({ url }) => url === deferredUrl,
            );
            assert.equal(lead.title, deferred.title);
            assert.equal(lead.sourceId, "old-source");
            assert.ok(
                !report.discovery.sources.some(
                    ({ text }) => text === deferred.text,
                ),
            );
        },
    );

async function fixture(t) {
    const base = join(tmpdir(), "pollinations-compact-tests");
    await mkdir(base, { recursive: true });
    const out = await mkdtemp(join(base, "compact-integration-"));
    const exitCode = process.exitCode;
    t.after(async () => {
        process.exitCode = exitCode;
        await rm(out, { recursive: true, force: true });
    });
    await mkdir(join(out, "pages"));
    await writeFile(
        join(out, "pages", `${hash(url)}.json`),
        JSON.stringify({
            requestedUrl: url,
            url,
            text,
            pageDigest: hash(text),
            extractionVersion: 2,
            fetchedAt: new Date().toISOString(),
            links: [],
        }),
    );
    for (const sort of ["trendingScore", "downloads"]) {
        const feed = `https://huggingface.co/api/models?sort=${sort}&direction=-1&limit=20`;
        const metadata = JSON.stringify([
            {
                id: sol.name,
                private: false,
                pipeline_tag: "text-generation",
                downloads: 0,
            },
        ]);
        await writeFile(
            join(out, "pages", `${hash(feed)}.json`),
            JSON.stringify({
                requestedUrl: feed,
                url: feed,
                text: metadata,
                pageDigest: hash(metadata),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
    }
    for (const community of ["LocalLLaMA", "StableDiffusion"]) {
        const seed = `https://www.reddit.com/r/${community}/.rss`;
        const body = `Fixture community discussion: ${sol.name} is already an official model.`;
        await writeFile(
            join(out, "pages", `${hash(seed)}.json`),
            JSON.stringify({
                requestedUrl: seed,
                url: seed,
                text: body,
                pageDigest: hash(body),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
    }
    const providerMetadata = JSON.stringify({ data: [] });
    await writeFile(
        join(out, "pages", `${hash(PROVIDER_INDEX_URL)}.json`),
        JSON.stringify({
            requestedUrl: PROVIDER_INDEX_URL,
            url: PROVIDER_INDEX_URL,
            text: providerMetadata,
            pageDigest: hash(providerMetadata),
            extractionVersion: 2,
            fetchedAt: new Date().toISOString(),
            links: [],
        }),
    );
    return {
        out,
        env: {
            ...Object.fromEntries(
                ["PATH", "SystemRoot", "PYTHONPATH"]
                    .filter((key) => process.env[key])
                    .map((key) => [key, process.env[key]]),
            ),
            PYTHON: python,
            TEMP: out,
            TMP: out,
            POLLINATIONS_API_KEY: "fixture-key",
            MODELS: model.name,
            MAX_POLLEN: "1",
            RESEARCH_OUT: out,
        },
    };
}

function nativeResponse(
    payload,
    relation = "supported",
    marketFinish = false,
    controlChoice,
) {
    const choice =
        controlChoice ??
        (payload.state.actions
            ? payload.state.stage === "search"
                ? payload.state.actions[0].id
                : ["crawl", "followup"].includes(payload.state.stage) &&
                    payload.state.actions.some(({ required }) => required)
                  ? payload.state.actions.find(({ required }) => required).id
                  : payload.state.stage === "reasoning" &&
                      !marketFinish &&
                      payload.state.actions.some(
                          ({ id }) => id === "reason-discovery",
                      )
                    ? "reason-discovery"
                    : "finish"
            : payload.state.providerPolicy
              ? `route_${payload.state.items[0].allowedIndexes[0]}`
              : payload.state.items
                ? relation
                : payload.state.candidates
                  ? relation
                  : "relevant");
    return {
        id: "fixture-native-response",
        model: JEV_MODEL,
        answers: Object.fromEntries(
            Object.entries(payload.questions).map(([key, question]) => {
                const item = payload.state.items?.find(({ id }) => id === key);
                const selected = key.startsWith("calibration-")
                    ? EVIDENCE_CHECKS.find(
                          ([excerpt, claim]) =>
                              excerpt === item.excerpt && claim === item.claim,
                      )[2]
                    : choice;
                return [
                    key,
                    {
                        type: "choice",
                        choice: selected,
                        probabilities: Object.fromEntries(
                            Object.keys(question.criteria).map((criterion) => [
                                criterion,
                                criterion === selected
                                    ? 0.98
                                    : 0.02 /
                                      (Object.keys(question.criteria).length -
                                          1),
                            ]),
                        ),
                        confidence: 0.98,
                    },
                ];
            }),
        ),
        usage: { input_tokens: 100, output_tokens: 0 },
    };
}

function network(
    t,
    inventory,
    {
        invalid,
        nativeAt = 1,
        absentQuote = false,
        marketRelation,
        longReason = false,
        extraProvider = false,
        extraProviderUrl = "https://8.8.8.8/fixture",
        marketFinish = false,
        chooseControl,
        sourceUrl = url,
        optionQueries,
        leadText = text,
        leadTitle = model.name,
        nativeFailures = [],
        solFailures = [],
        extractRelation = "irrelevant",
        wrongCalibration = false,
    } = {},
) {
    const calls = { search: [], native: [], sol: [] };
    t.mock.method(globalThis, "fetch", async (endpoint, options) => {
        if (endpoint === `${api}/models?reliability=all`)
            return Response.json(inventory);
        if (endpoint === `${api}/mcp`)
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
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization, "Bearer fixture-key");
        const payload = JSON.parse(options.body);
        if (endpoint === `${api}/mcp/exa`) {
            calls.search.push(payload);
            assert.equal(payload.method, "tools/call");
            assert.equal(payload.params.name, "web_search_exa");
            return Response.json({
                jsonrpc: "2.0",
                id: payload.id,
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                results: [
                                    {
                                        url: sourceUrl,
                                        title: leadTitle,
                                        text: leadText,
                                    },
                                    ...(extraProvider
                                        ? [
                                              {
                                                  url: extraProviderUrl,
                                                  title: model.name,
                                                  text,
                                              },
                                          ]
                                        : []),
                                ],
                            }),
                        },
                    ],
                },
            });
        }
        if (endpoint === `${api}${JEV_ENDPOINT}`) {
            calls.native.push(payload);
            const failure = nativeFailures[calls.native.length - 1];
            if (failure)
                return new Response("Transient native failure", {
                    status: failure,
                });
            assert.equal(payload.model, JEV_MODEL);
            assert.ok(Object.keys(payload.questions).length > 0);
            assert.equal(
                payload.messages,
                undefined,
                "Jev must use its native shared-state protocol",
            );
            const response = nativeResponse(
                payload,
                payload.state.items?.some(({ id }) =>
                    id.startsWith("discovery:"),
                )
                    ? marketRelation
                    : payload.state.candidates
                      ? extractRelation
                      : "supported",
                marketFinish,
                payload.state.actions
                    ? chooseControl?.(payload, calls)
                    : undefined,
            );
            if (invalid === "all-answer")
                response.answers.unknown = Object.values(response.answers)[0];
            if (wrongCalibration && response.answers["calibration-1"])
                response.answers["calibration-1"] = {
                    type: "choice",
                    choice: "supported",
                    confidence: 0.97,
                    probabilities: {
                        supported: 0.98,
                        contradicted: 0.01,
                        insufficient: 0.01,
                    },
                };
            const invalidTarget =
                nativeAt === 1
                    ? payload.state.canonicalModelIds
                    : payload.state.items && !payload.state.providerPolicy;
            if (invalidTarget) {
                if (invalid === "usage") response.usage.input_tokens = 0;
                if (invalid === "answer")
                    response.answers.unknown = Object.values(
                        response.answers,
                    )[0];
                if (invalid === "probabilities")
                    for (const answer of Object.values(response.answers))
                        answer.probabilities[answer.choice] = 0.5;
            }
            return Response.json(response);
        }
        assert.equal(
            endpoint,
            `${api}/v1/chat/completions`,
            "All network requests must stay on the mocked Pollinations boundary",
        );
        calls.sol.push(payload);
        const failure = solFailures[calls.sol.length - 1];
        if (failure)
            return new Response("Transient reasoning failure", {
                status: failure,
            });
        assert.equal(payload.model, sol.name);
        const context = JSON.parse(payload.messages[1].content);
        if (context.preparation && !context.models) {
            assert.equal(payload.max_tokens, 1800);
            assert.deepEqual(
                context.officialModelInventory,
                inventory.map(({ name, aliases }) => [name, aliases ?? []]),
                "Sol must receive the exact official inventory to reason about novelty",
            );
        }
        if (optionQueries && !context.preparation) {
            assert.equal(payload.tools, undefined);
            assert.equal(payload.max_tokens, 800);
            assert.equal(payload.reasoning_effort, "medium");
            return Response.json({
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 80,
                    total_tokens: 180,
                },
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: JSON.stringify({ queries: optionQueries }),
                        },
                    },
                ],
            });
        }
        assert.equal(
            context.preparation.searches.length,
            context.models ? 4 : 1,
        );
        if (!marketRelation || !context.models)
            assert.ok(
                context.preparation.sources.length >= 1 &&
                    context.preparation.sources.length <= 16,
            );
        assert.equal(
            context.savedSources,
            undefined,
            "Prepared sources must not be repeated in saved context",
        );
        const source = context.preparation.sources[0];
        if (source) {
            assert.equal(source.method, "scrapling-http");
            assert.equal(source.pageDigest, hash(text));
        }
        const candidate = {
            action: "verify",
            routes: [],
            discoveries: [],
            gaps: [],
            models: [
                {
                    name: model.name,
                    discoveries: [],
                    gaps: [
                        "Account credit coverage and live runtime remain unknown",
                    ],
                    routes: [
                        {
                            provider: "fixture-provider",
                            providerWebsite: "https://1.1.1.1",
                            upstreamModel: model.name,
                            exactMatch: true,
                            available: true,
                            capabilitiesMatch: true,
                            creditEligibility: "unknown",
                            pricing: {
                                currency: "USD",
                                unit: "1M_tokens",
                                input: null,
                                output: null,
                            },
                            claims: [
                                {
                                    kind: "identity",
                                    sourceId: source.id,
                                    quote: model.name,
                                },
                                {
                                    kind: "availability",
                                    sourceId: source.id,
                                    quote: "fixture-embedding-8b is available now through a managed serverless API.",
                                },
                                {
                                    kind: "capabilities",
                                    sourceId: source.id,
                                    quote: "fixture-embedding-8b accepts text input and returns embedding vectors.",
                                },
                                {
                                    kind: "price",
                                    sourceId: source.id,
                                    quote: "fixture-embedding-8b\n$0.010\n/ 1M tokens",
                                },
                            ],
                            notes: "Fixture document evidence only",
                        },
                    ],
                },
            ],
        };
        if (marketRelation) {
            if (context.models)
                candidate.models = context.models.map(({ name }) => ({
                    name,
                    routes: [],
                    discoveries: [],
                    gaps: ["No documented route"],
                }));
            else {
                delete candidate.models;
                candidate.discoveries = [
                    {
                        name: "fixture-embedding-8b",
                        kind: "model",
                        reason: longReason
                            ? "Documented embedding model. ".repeat(60)
                            : "Accepts text and returns embedding vectors",
                        sourceIds: [source.id],
                        semanticAudit: [
                            {
                                relation: "supported",
                                requestDigest: "unverified",
                            },
                        ],
                    },
                ];
            }
        }
        if (absentQuote)
            candidate.models[0].routes[0].claims[1].quote =
                "fixture-embedding-8b is available on every planet through a managed serverless API.";
        return Response.json({
            usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            },
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "fixture-verify",
                                type: "function",
                                function: {
                                    name: "research",
                                    arguments: JSON.stringify(candidate),
                                },
                            },
                        ],
                    },
                },
            ],
        });
    });
    return calls;
}

test(
    "default compact main wires Exa, native Jev, cached Python extraction, zero official Sol calls and workflow submission",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev]);
        const report = await main(env);
        assert.equal(report.researchMode, "compact");
        assert.equal(
            report.status,
            "complete",
            JSON.stringify({
                reason: report.models[0].reason,
                lastCall: report.calls.at(-1)?.validationError,
            }),
        );
        assert.equal(report.discovery.status, "skipped");
        assert.equal(calls.search.length, 4);
        assert.equal(
            calls.sol.length,
            0,
            "Official research must not call Sol",
        );
        assert.equal(
            calls.native.length,
            7,
            "Four native search choices, triage, reasoning finish and claim audit must be wired",
        );
        assert.deepEqual(
            calls.native.find(({ state }) => state.canonicalModelIds).state
                .canonicalModelIds,
            [model.name],
        );
        assert.ok(
            calls.native
                .find(({ state }) => state.items && !state.providerPolicy)
                .state.items.every(
                    ({ id }) =>
                        id.startsWith(model.name) ||
                        id.startsWith("calibration-"),
                ),
        );
        assert.equal(report.calibration.checked, 2);
        assert.equal(report.calibration.errors, 0);
        const row = report.models[0];
        assert.match(row.auditDigest, /^[a-f0-9]{64}$/);
        assert.deepEqual(
            row.searches.map(({ scope }) => scope),
            ["azure", "fireworks", "bedrock", "alternatives"],
        );
        assert.equal(
            row.preparation.leads.length,
            1,
            "Four searches must deduplicate the same URL",
        );
        assert.match(
            row.preparation.triage.requestDigests[0],
            /^[a-f0-9]{64}$/,
        );
        assert.equal(report.sources.length, 1);
        assert.equal(report.sources[0].pageDigest, hash(text));
        assert.equal(report.sources[0].digest, hash(report.sources[0].text));
        assert.equal(report.sources[0].extractionVersion, 2);
        const route = row.routes[0];
        assert.equal(
            route.pricing.input,
            0.01,
            "Deterministic extraction must recover a price omitted by Sol",
        );
        assert.equal(route.pricing.output, null);
        assert.equal(route.runtimeVerified, false);
        assert.equal(route.creditEligibility, "unknown");
        assert.equal(route.cashCost, null);
        assert.equal(route.semanticAudit.length, 1);
        for (const grade of route.semanticAudit) {
            assert.equal(grade.relation, "supported");
            assert.match(grade.requestDigest, /^[a-f0-9]{64}$/);
        }
        for (const claim of route.claims)
            assert.equal(claim.quoteHash, hash(claim.quote));
        assert.ok(
            row.actions.some(
                ({ action, status, executor }) =>
                    action === "submit" &&
                    status === "submitted" &&
                    executor === "workflow",
            ),
        );
        assert.ok(
            row.actions.some(
                ({ action, status }) =>
                    action === "verify" && status === "audited",
            ),
        );
        assert.ok(
            report.calls.every(
                ({ status, reserved }) => status === "received" && reserved > 0,
            ),
        );
        const nativeReceipts = report.calls.filter(
            ({ kind }) => kind === `inference:${JEV_MODEL}`,
        );
        assert.equal(nativeReceipts.length, 7);
        assert.ok(
            nativeReceipts.every(
                ({ reserved, accountedPollen, usage, requestDigest }) =>
                    accountedPollen > 0 &&
                    reserved >= accountedPollen &&
                    usage.input_tokens === 100 &&
                    /^[a-f0-9]{64}$/.test(requestDigest),
            ),
        );
        assert.equal(report.budgetUsedPollen, budgetUsed(report));
        assert.ok(
            report.budgetUsedPollen > 0 &&
                report.budgetUsedPollen < report.maxPollen,
        );
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);

test(
    "official compact main invokes grounded native provider comparison without Sol",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const second = "https://8.8.8.8/fixture";
        await writeFile(
            join(out, "pages", `${hash(second)}.json`),
            JSON.stringify({
                requestedUrl: second,
                url: second,
                text,
                pageDigest: hash(text),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const calls = network(t, [model, sol, jev], { extraProvider: true });
        const report = await main(env);
        assert.equal(report.status, "complete");
        assert.equal(calls.sol.length, 0);
        const comparisons = calls.native.filter(
            ({ state }) => state.providerPolicy,
        );
        assert.equal(comparisons.length, 1);
        assert.equal(comparisons[0].state.items[0].routes.length, 2);
        const row = report.models[0];
        assert.ok(row.providerComparison);
        assert.match(row.providerComparison.requestDigest, /^[a-f0-9]{64}$/);
        assert.equal(row.routes.length, 2);
        assert.ok(
            row.routes.every(
                (route) =>
                    route.creditEligibility === "unknown" &&
                    route.cashCost === null &&
                    route.runtimeVerified === false,
            ),
        );
    },
);

test(
    "official compact main rejects invalid evidence grades while settling valid native usage",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        const calls = network(t, [model, sol, jev], {
            invalid: "probabilities",
            nativeAt: 2,
        });
        const report = await main(env);
        assert.equal(report.status, "complete");
        assert.equal(calls.sol.length, 0);
        assert.equal(calls.native.length, 7);
        const receipt = report.calls.at(-1);
        assert.equal(receipt.status, "received");
        assert.ok(receipt.reserved > 0);
        assert.ok(receipt.observedPollen > 0);
        assert.equal(receipt.nativeResponse.usage.input_tokens, 100);
        assert.ok(
            Object.values(receipt.nativeResponse.answers).every(
                ({ probabilitySum }) => Math.abs(probabilitySum - 0.52) < 1e-10,
            ),
        );
        assert.ok(receipt.validationErrors.length);
        assert.equal(receipt.accountedPollen, receipt.observedPollen);
        assert.ok(
            report.models[0].actions.some(({ action }) => action === "submit"),
        );
        const route = report.models[0].routes[0];
        assert.equal(
            route.pricing.input,
            0.01,
            "Validated documentary prices survive a rejected native decision",
        );
        assert.equal(route.available, null);
        assert.equal(route.capabilitiesMatch, null);
        assert.equal(report.models[0].recommendation, null);
    },
);

test(
    "native discovery finish performs no automatic Sol work",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        delete env.MODELS;
        const calls = network(t, [sol, jev], { marketFinish: true });
        const report = await main(env);
        assert.equal(
            report.status,
            "complete",
            JSON.stringify(report.discovery),
        );
        assert.equal(calls.sol.length, 0);
        assert.equal(report.discovery.status, "researched");
        assert.deepEqual(report.discovery.discoveries, []);
        const choice = calls.native.find(
            ({ state }) =>
                state.stage === "reasoning" &&
                state.actions.some(({ id }) => id === "reason-discovery"),
        );
        assert.ok(
            choice,
            "Discovery synthesis must be explicitly offered to its native supervisor",
        );
        assert.ok(
            report.discovery.actions.some(
                ({ tool, actionId }) =>
                    tool === "control" && actionId === "finish",
            ),
        );
    },
);

test(
    "native discovery extraction publishes literal model leads without Sol or invented facts",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const release = `${model.name} was newly released in 2026-10 and community members request this embedding model. ${text}`;
        await writeFile(
            join(out, "pages", `${hash(url)}.json`),
            JSON.stringify({
                requestedUrl: url,
                url,
                text: release,
                pageDigest: hash(release),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const calls = network(t, [sol, jev], {
            marketFinish: true,
            extractRelation: "model",
            leadText: release,
        });
        const report = await main({ ...env, MODELS: "" });
        assert.equal(
            report.discovery.status,
            "researched",
            report.discovery.reason,
        );
        assert.equal(calls.sol.length, 0);
        const extractionCalls = calls.native.filter(
            ({ state }) => state.candidates,
        );
        assert.equal(extractionCalls.length, 1);
        const discovery = report.discovery.discoveries.find(
            (item) => item.name === model.name,
        );
        assert.ok(discovery);
        const source = report.discovery.sources.find(
            ({ id }) => id === discovery.sourceIds[0],
        );
        assert.equal(
            source.text.slice(
                discovery.extraction.start,
                discovery.extraction.end,
            ),
            discovery.extraction.quote,
        );
        assert.match(discovery.extraction.requestDigest, /^[a-f0-9]{64}$/);
        assert.equal(discovery.pricing, undefined);
        assert.ok(
            report.quality.discoveryCoverage.every(({ searched }) => searched),
        );
        assert.equal(
            report.quality.discoveryCoverage.find(
                ({ mode }) => mode === "reddit",
            ).platformPages,
            2,
            "Only the two fetched community seed pages count as Reddit coverage",
        );
    },
);

test(
    "Sol consolidation cannot drop Jev's source-supported discovery lead",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        const calls = network(t, [sol, jev], {
            extractRelation: "model",
            marketRelation: "supported",
        });
        const report = await main({ ...env, MODELS: "" });
        assert.equal(
            report.discovery.status,
            "researched",
            report.discovery.reason,
        );
        assert.equal(calls.sol.length, 1);
        const context = JSON.parse(calls.sol[0].messages[1].content);
        assert.ok(
            context.preparation.extractedDiscoveries.some(
                ({ name }) => name === model.name,
            ),
        );
        assert.ok(
            report.discovery.discoveries.some(
                ({ name }) => name === model.name,
            ),
        );
        assert.equal(
            report.discovery.preparation.extraction.discoveries.length,
            1,
        );
    },
);

for (const relation of [
    "supported",
    "insufficient",
    "contradicted",
    "too-long",
])
    test(
        `compact market discovery receives bounded native support grading: ${relation}`,
        { skip: !available && "Python with Scrapling unavailable" },
        async (t) => {
            const { env } = await fixture(t);
            delete env.MODELS;
            const calls = network(t, [sol, jev], {
                marketRelation:
                    relation === "too-long" ? "supported" : relation,
                longReason: relation === "too-long",
            });
            const report = await main(env);
            assert.equal(
                report.status,
                "complete",
                JSON.stringify({
                    reason: report.discovery.reason,
                    models: report.models.map(({ name, reason }) => ({
                        name,
                        reason,
                    })),
                    lastCall: report.calls.at(-1)?.validationError,
                }),
            );
            assert.equal(report.discovery.status, "researched");
            const audits = calls.native.filter(({ state }) =>
                state.items?.some(({ id }) => id.startsWith("discovery:")),
            );
            assert.equal(audits.length, relation === "too-long" ? 0 : 1);
            if (audits.length) {
                const item = audits[0].state.items[0];
                assert.match(item.claim, /fixture-embedding-8b as a model/);
                assert.match(
                    item.claim,
                    /Accepts text and returns embedding vectors/,
                );
                assert.match(item.excerpt, /fixture-embedding-8b/);
                assert.ok(
                    item.claim.length <= 1000 && item.excerpt.length <= 1600,
                );
            }
            assert.equal(
                report.discovery.discoveries.length,
                relation === "supported" ? 1 : 0,
            );
            if (relation === "supported") {
                const [grade] = report.discovery.discoveries[0].semanticAudit;
                assert.equal(grade.relation, "supported");
                assert.match(grade.requestDigest, /^[a-f0-9]{64}$/);
                assert.ok(
                    report.calls.some(
                        (call) =>
                            call.requestDigest === grade.requestDigest &&
                            call.status === "received",
                    ),
                );
            } else
                assert.ok(
                    report.discovery.gaps.some((gap) =>
                        gap.includes(
                            relation === "too-long"
                                ? "exceeds bounded semantic audit"
                                : `discovery evidence ${relation}`,
                        ),
                    ),
                );
            assert.match(report.discovery.auditDigest, /^[a-f0-9]{64}$/);
        },
    );

test(
    "official pipeline recovers a Jev 503 and continues with its uncertain charge reserved",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const waits = [];
        t.mock.method(timers, "setTimeout", async (delay) => waits.push(delay));
        const calls = network(t, [model, sol, jev], { nativeFailures: [503] });
        const report = await main(env);
        assert.equal(report.status, "complete");
        assert.equal(report.models[0].status, "researched");
        assert.equal(calls.sol.length, 0);
        assert.deepEqual(waits, [2000]);
        assert.deepEqual(calls.native[0], calls.native[1]);
        assert.equal(report.calls[0].status, "uncertain");
        assert.equal(report.calls[1].status, "received");
        assert.equal(report.calls[0].operationId, report.calls[1].operationId);
        assert.ok(report.budgetUsedPollen >= report.calls[0].reserved);
        assert.ok(report.budgetUsedPollen <= report.maxPollen);
        assert.ok(
            report.calls.slice(2).every(({ status }) => status === "received"),
        );
        assert.match(report.models[0].auditDigest, /^[a-f0-9]{64}$/);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);

test(
    "HTTP recovery followed by invalid Jev evidence never unlocks downstream paid work",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        t.mock.method(timers, "setTimeout", async () => {});
        const calls = network(t, [model, sol, jev], {
            nativeFailures: [503],
            invalid: "all-answer",
        });
        const report = await main(env);
        assert.equal(report.status, "partial");
        assert.equal(calls.native.length, 2);
        assert.equal(report.calls.length, 2);
        assert.equal(report.calls[0].operationId, report.calls[1].operationId);
        assert.equal(calls.search.length, 0);
        assert.equal(calls.sol.length, 0);
        assert.ok(report.calls.every(({ status }) => status === "pending"));
        assert.equal(
            report.budgetUsedPollen,
            report.calls.reduce((total, { reserved }) => total + reserved, 0),
        );
        assert.equal(report.models[0].status, "blocked");
    },
);

for (const invalid of ["usage", "answer"])
    test(
        `compact main retains uncertain native ${invalid} receipt and stops before Sol`,
        {
            skip: !available && "Python with Scrapling unavailable",
        },
        async (t) => {
            const { out, env } = await fixture(t);
            const second = {
                ...model,
                name: "fixture-publisher/fixture-embedding-4b",
            };
            const calls = network(t, [model, second, sol, jev], { invalid });
            const report = await main({
                ...env,
                MODELS: `${model.name},${second.name}`,
            });
            assert.equal(calls.search.length, 4);
            assert.equal(calls.native.length, 5);
            assert.equal(calls.sol.length, 0);
            assert.equal(report.status, "partial");
            assert.ok(
                report.models.every(({ status }) => status === "blocked"),
            );
            const receipt = report.calls.at(-1);
            assert.equal(receipt.kind, `inference:${JEV_MODEL}`);
            assert.equal(receipt.status, "pending");
            assert.ok(receipt.reserved > 0);
            assert.equal(receipt.accountedPollen, undefined);
            assert.ok(report.budgetUsedPollen >= receipt.reserved);
            assert.equal(
                report.sources.length,
                0,
                "Invalid triage must stop before HTTP source reads",
            );
            const row = report.models[0];
            const scopes = ["azure", "fireworks", "bedrock", "alternatives"];
            assert.deepEqual(
                row.searches.map(({ scope }) => scope),
                scopes,
            );
            assert.deepEqual(
                row.actions
                    .filter(({ tool }) => tool === "search")
                    .map(({ scope, status }) => ({ scope, status })),
                scopes.map((scope) => ({ scope, status: "searched" })),
            );
            assert.deepEqual(row.preparation.leads, [
                {
                    id: "lead-1",
                    url,
                    title: model.name,
                    text,
                    models: [model.name],
                    scopes,
                    modes: ["web"],
                    queryModels: [model.name, second.name].sort(),
                    status: "pending",
                    attempted: false,
                },
            ]);
            assert.deepEqual(
                JSON.parse(await readFile(join(out, "research.json"), "utf8")),
                report,
            );
        },
    );

test(
    "compact main rejects the next shared-budget search before fetch",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev]);
        const report = await main({ ...env, MAX_POLLEN: "0.02" });
        assert.equal(report.status, "partial");
        assert.equal(report.models[0].status, "blocked");
        assert.match(report.models[0].reason, /Pollen budget exhausted/);
        assert.equal(calls.search.length, 2);
        assert.equal(calls.native.length, 3);
        assert.equal(calls.sol.length, 0);
        assert.equal(report.calls.length, 5);
        assert.ok(report.calls.every(({ status }) => status === "received"));
        assert.equal(report.budgetUsedPollen, budgetUsed(report));
        assert.ok(
            report.budgetUsedPollen > 0.014 &&
                report.budgetUsedPollen < report.maxPollen,
        );
        assert.ok(
            report.calls.every(({ reserved }) => reserved < report.maxPollen),
        );
        assert.ok(
            report.budgetUsedPollen +
                report.calls.find(({ kind }) => !kind.startsWith("inference:"))
                    .reserved >
                report.maxPollen,
        );
        assert.equal(report.sources.length, 0);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);

test(
    "paid-only catalog classification does not block budgeted Jev research or trigger Sol spending",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        const calls = network(t, [
            model,
            { ...sol, paid_only: true },
            { ...jev, paid_only: true },
        ]);
        const report = await main(env);
        assert.equal(report.status, "complete");
        assert.equal(calls.sol.length, 0);
        assert.ok(report.calls.every(({ reserved }) => reserved > 0));
        assert.ok(report.budgetUsedPollen <= report.maxPollen);
    },
);

test(
    "main fetches the free provider index and lets Jev investigate exact mapped providers without importing metadata prices",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const metadata = JSON.stringify({
            data: [
                {
                    id: model.name,
                    providers: [
                        {
                            provider: "niche-host",
                            status: "live",
                            pricing: { input: 0.0001 },
                        },
                    ],
                },
            ],
        });
        await writeFile(
            join(out, "pages", `${hash(PROVIDER_INDEX_URL)}.json`),
            JSON.stringify({
                requestedUrl: PROVIDER_INDEX_URL,
                url: PROVIDER_INDEX_URL,
                text: metadata,
                pageDigest: hash(metadata),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const calls = network(t, [model, sol, jev], {
            marketFinish: true,
            chooseControl: ({ state }) =>
                state.stage === "search"
                    ? state.actions[0].id
                    : (state.actions.find(({ required }) => required)?.id ??
                      state.actions.find(({ id }) => id.startsWith("niche-"))
                          ?.id ??
                      "finish"),
        });
        const report = await main({ ...env, MODELS: "" });
        assert.equal(report.status, "complete", report.discovery.reason);
        assert.equal(calls.sol.length, 0);
        assert.equal(report.providerIndex.status, "fetched");
        assert.equal(report.providerIndex.officialMatches, 1);
        assert.deepEqual(report.providerIndex.providers[0].modelNames, [
            model.name,
        ]);
        assert.ok(
            calls.search.some(
                ({
                    params: {
                        arguments: { query },
                    },
                }) =>
                    query.includes('"niche-host"') &&
                    query.includes('"fixture-embedding-8b"'),
            ),
        );
        const row = report.models.find(({ name }) => name === model.name);
        assert.equal(row.routes[0].pricing.input, 0.01);
        assert.ok(
            row.routes.every(({ provider }) => provider !== "niche-host"),
        );
        assert.ok(report.sources.some(({ url }) => url === PROVIDER_INDEX_URL));
    },
);

test(
    "main rejects native evidence when a known-answer canary fails, preserving sourced prices and cost receipts",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { env } = await fixture(t);
        const calls = network(t, [model, sol, jev], { wrongCalibration: true });
        const report = await main(env),
            row = report.models[0];
        assert.equal(
            calls.native.length,
            7,
            "Canaries share the existing audit call",
        );
        assert.equal(calls.sol.length, 0);
        assert.equal(report.calibration.errors, 1);
        assert.equal(report.calibration.threshold, 0.981);
        assert.equal(row.routes[0].available, null);
        assert.equal(row.routes[0].pricing.input, 0.01);
        assert.equal(row.routes[0].semanticAudit[0].relation, "insufficient");
        assert.equal(row.routes[0].semanticAudit[0].rawRelation, "supported");
        assert.equal(row.routes[0].semanticAudit[0].calibrationAccepted, false);
        assert.ok(row.gaps.some((gap) => gap.includes("calibration rejected")));
        assert.ok(report.calls.every(({ status }) => status === "received"));
        assert.equal(report.budgetUsedPollen, budgetUsed(report));
    },
);

test(
    "compact main retains a corrupt native claim-audit receipt without submission",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev], {
            invalid: "answer",
            nativeAt: 2,
        });
        const report = await main(env);
        assert.equal(
            calls.search.length,
            4,
            JSON.stringify({
                reason: report.models[0].reason,
                last: report.calls.at(-1)?.validationError,
            }),
        );
        assert.equal(calls.native.length, 7);
        assert.equal(calls.sol.length, 0);
        assert.ok(
            calls.native.find(
                ({ state }) => state.items && !state.providerPolicy,
            ).state.items.length > 0,
        );
        assert.equal(report.status, "partial");
        assert.equal(report.models[0].status, "blocked");
        assert.ok(
            !report.models[0].actions.some(({ action }) => action === "submit"),
        );
        assert.equal(report.models[0].auditDigest, undefined);
        const receipt = report.calls.at(-1);
        assert.equal(receipt.kind, `inference:${JEV_MODEL}`);
        assert.equal(receipt.status, "pending");
        assert.ok(receipt.reserved > 0);
        assert.equal(receipt.accountedPollen, undefined);
        assert.match(receipt.requestDigest, /^[a-f0-9]{64}$/);
        assert.ok(report.budgetUsedPollen >= receipt.reserved);
        assert.equal(report.budgetUsedPollen, budgetUsed(report));
        assert.equal(report.sources[0].text, text);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);

test(
    "compact official main ignores Sol candidates and copies only source evidence",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev], { absentQuote: true });
        const report = await main(env);
        assert.equal(
            report.status,
            "complete",
            JSON.stringify({
                reason: report.models[0].reason,
                lastCall: report.calls.at(-1)?.validationError,
            }),
        );
        assert.equal(calls.search.length, 4);
        assert.equal(calls.sol.length, 0);
        assert.equal(report.sources[0].text, text);
        assert.equal(report.status, "complete");
        assert.equal(report.models[0].status, "researched");
        assert.ok(
            report.models[0].actions.some(({ action }) => action === "submit"),
        );
        assert.match(report.models[0].auditDigest, /^[a-f0-9]{64}$/);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);

test(
    "main lets Jev request Sol options and choose one query without trusting Sol facts",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const waits = [];
        t.mock.method(timers, "setTimeout", async (delay) => waits.push(delay));
        const sourceUrl = "https://fireworks.ai/models/fixture-embedding-8b";
        const gapText = `${model.name}\nEmbeddings\nfixture-embedding-8b\n$0.010\n/ 1M tokens`;
        await writeFile(
            join(out, "pages", `${hash(sourceUrl)}.json`),
            JSON.stringify({
                requestedUrl: sourceUrl,
                url: sourceUrl,
                text: gapText,
                pageDigest: hash(gapText),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const optionQueries = [
            '"fixture-embedding-8b" discarded generic availability option',
            '"fixture-embedding-8b" targeted managed API provider documentation',
        ];
        const calls = network(t, [model, sol, jev], {
            sourceUrl,
            optionQueries,
            solFailures: [503],
            chooseControl: (payload) => {
                const actions = payload.state.actions;
                if (payload.state.stage === "search") return actions[0].id;
                if (actions.some(({ id }) => id === "sol-query-1"))
                    return "sol-query-1";
                if (actions.some(({ id }) => id.startsWith("sol-query")))
                    return "finish";
                return (
                    actions.find(
                        ({ kind }) =>
                            kind ===
                            (payload.state.stage === "reasoning"
                                ? "reason"
                                : "search"),
                    )?.id ?? "finish"
                );
            },
        });
        const report = await main(env);
        assert.equal(
            report.status,
            "complete",
            JSON.stringify(report.models.map(({ reason }) => reason)),
        );
        assert.equal(
            calls.sol.length,
            2,
            "Only the failed Sol request may retry after Jev requested reasoning",
        );
        assert.deepEqual(waits, [2000]);
        const solReceipts = report.calls.filter(
            ({ kind }) => kind === `inference:${sol.name}`,
        );
        assert.equal(solReceipts[0].status, "uncertain");
        assert.equal(solReceipts[1].status, "received");
        assert.notEqual(solReceipts[0].contextSeed, solReceipts[1].contextSeed);
        assert.ok(report.budgetUsedPollen >= solReceipts[0].reserved);
        const queries = calls.search.map(
            ({ params }) => params.arguments.query,
        );
        assert.ok(
            queries.includes(optionQueries[1]),
            "Jev's chosen option must execute",
        );
        assert.ok(
            !queries.includes(optionQueries[0]),
            "Sol cannot automatically execute its other option",
        );
        assert.ok(
            report.models[0].actions.some(
                ({ tool, actionId }) =>
                    tool === "control" && actionId === "sol-query-1",
            ),
        );
        assert.equal(report.models[0].routes[0].pricing.input, 0.01);
        assert.equal(report.models[0].routes[0].available, null);
        assert.equal(report.models[0].recommendation, null);
    },
);

test(
    "Sol reasoning skips unavailable source packets without blocking the official group",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        await writeFile(
            join(out, "pages", `${hash(url)}.json`),
            JSON.stringify({
                requestedUrl: url,
                url,
                text,
                pageDigest: "invalid",
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const second = "https://fireworks.ai/models/fixture-embedding-8b";
        const partial = `${model.name}\nEmbeddings\nfixture-embedding-8b\n$0.010\n/ 1M tokens`;
        await writeFile(
            join(out, "pages", `${hash(second)}.json`),
            JSON.stringify({
                requestedUrl: second,
                url: second,
                text: partial,
                pageDigest: hash(partial),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const calls = network(t, [model, sol, jev], {
            extraProvider: true,
            extraProviderUrl: second,
            optionQueries: [],
            chooseControl: ({ state }) =>
                state.stage === "search"
                    ? state.actions[0].id
                    : state.stage === "reasoning"
                      ? (state.actions.find(({ kind }) => kind === "reason")
                            ?.id ?? "finish")
                      : (state.actions.find(({ kind }) => kind === "search")
                            ?.id ?? "finish"),
        });
        const report = await main(env);
        assert.equal(report.status, "complete", report.models[0].reason);
        assert.equal(
            calls.sol.length,
            1,
            JSON.stringify(
                calls.native
                    .filter(({ state }) => state.actions)
                    .map(({ state }) => ({
                        stage: state.stage,
                        actions: state.actions,
                    })),
            ),
        );
        const context = JSON.parse(calls.sol[0].messages[1].content);
        assert.equal(context.sources.length, 1);
        assert.equal(context.sources[0].url, second);
        assert.equal(typeof context.sources[0].excerpt, "string");
        assert.ok(
            report.sources.some(({ status }) => status === "unavailable"),
        );
        assert.equal(report.models[0].routes[0].pricing.input, 0.01);
    },
);

test(
    "main extracts distant prices from an unfocused catalogue and refreshes without paid calls",
    { skip: !available && "Python with Scrapling unavailable" },
    async (t) => {
        const { out, env } = await fixture(t);
        const sourceUrl = url;
        const fullText = `${model.name}\n${"navigation before pricing\n".repeat(400)}\nfixture-embedding-8b is available now through a managed serverless API.\nEmbeddings\nfixture-embedding-8b\n$0.010\n/ 1M tokens`;
        await writeFile(
            join(out, "pages", `${hash(sourceUrl)}.json`),
            JSON.stringify({
                requestedUrl: sourceUrl,
                url: sourceUrl,
                text: fullText,
                pageDigest: hash(fullText),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const calls = network(t, [model, sol, jev], {
            sourceUrl,
            leadTitle: "Provider catalogue",
            leadText: "General provider catalogue and pricing",
        });
        const report = await main(env);
        assert.equal(
            report.status,
            "complete",
            JSON.stringify(report.models.map(({ reason }) => reason)),
        );
        assert.equal(calls.sol.length, 0);
        assert.ok(report.sources[0].text.length > 3000);
        assert.equal(
            report.sources[0].focus,
            undefined,
            "The full page must be recovered even without focus metadata",
        );
        assert.equal(report.sources[0].fullPage, true);
        assert.equal(report.sources[0].digest, hash(fullText));
        assert.equal(report.models[0].routes[0].pricing.input, 0.01);
        assert.ok(
            report.models[0].routes[0].priceEvidence.evidence.every(
                ({ quote, start, end }) => fullText.slice(start, end) === quote,
            ),
        );
        for (const payload of calls.native.filter(
            (payload) => payload.state.evidence,
        ))
            assert.ok(
                payload.state.evidence.length < fullText.length,
                "Jev receives bounded facts, not the whole page",
            );
        const nextOut = join(out, "refresh");
        await mkdir(join(nextOut, "pages"), { recursive: true });
        await writeFile(
            join(nextOut, "pages", `${hash(sourceUrl)}.json`),
            JSON.stringify({
                requestedUrl: sourceUrl,
                url: sourceUrl,
                text: fullText,
                pageDigest: hash(fullText),
                extractionVersion: 2,
                fetchedAt: new Date().toISOString(),
                links: [],
            }),
        );
        const before = {
            native: calls.native.length,
            search: calls.search.length,
        };
        const refreshed = await main({
            ...env,
            RESEARCH_OUT: nextOut,
            PREVIOUS_RESEARCH: join(out, "research.json"),
        });
        assert.equal(
            refreshed.models[0].reused,
            true,
            "Removing the whole-page refresh must invalidate reuse and fail this test",
        );
        assert.equal(refreshed.models[0].routes[0].pricing.input, 0.01);
        assert.deepEqual(
            { native: calls.native.length, search: calls.search.length },
            before,
            "An unchanged whole page must cost no paid calls",
        );
        assert.equal(refreshed.calls.length, 0);
    },
);
