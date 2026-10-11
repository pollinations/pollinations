import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JEV_ENDPOINT, JEV_MODEL } from "./jev.mjs";
import { budgetUsed, main, sourcePackets } from "./researcher.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
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

async function fixture(t) {
    const base = fileURLToPath(new URL("../../temp/", import.meta.url));
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
            extractionVersion: 1,
            fetchedAt: new Date().toISOString(),
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

function nativeResponse(payload) {
    const choice = payload.state.items ? "supported" : "relevant";
    return {
        id: "fixture-native-response",
        model: JEV_MODEL,
        answers: Object.fromEntries(
            Object.entries(payload.questions).map(([key, question]) => [
                key,
                {
                    type: "choice",
                    choice,
                    probabilities: Object.fromEntries(
                        Object.keys(question.criteria).map((criterion) => [
                            criterion,
                            criterion === choice ? 0.98 : 0.01,
                        ]),
                    ),
                    confidence: 0.98,
                },
            ]),
        ),
        usage: { input_tokens: 100, output_tokens: 0 },
    };
}

function network(
    t,
    inventory,
    { invalid, nativeAt = 1, absentQuote = false } = {},
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
                                results: [{ url, title: model.name, text }],
                            }),
                        },
                    ],
                },
            });
        }
        if (endpoint === `${api}${JEV_ENDPOINT}`) {
            calls.native.push(payload);
            assert.equal(payload.model, JEV_MODEL);
            assert.ok(Object.keys(payload.questions).length > 0);
            assert.equal(
                payload.messages,
                undefined,
                "Jev must use its native shared-state protocol",
            );
            const response = nativeResponse(payload);
            if (calls.native.length === nativeAt) {
                if (invalid === "usage") response.usage.input_tokens = 0;
                if (invalid === "answer")
                    response.answers.unknown = Object.values(
                        response.answers,
                    )[0];
            }
            return Response.json(response);
        }
        assert.equal(
            endpoint,
            `${api}/v1/chat/completions`,
            "All network requests must stay on the mocked Pollinations boundary",
        );
        calls.sol.push(payload);
        assert.equal(payload.model, sol.name);
        const context = JSON.parse(payload.messages[1].content);
        assert.equal(context.preparation.searches.length, 4);
        assert.equal(context.preparation.sources.length, 1);
        assert.equal(
            context.savedSources,
            undefined,
            "Prepared sources must not be repeated in saved context",
        );
        const source = context.preparation.sources[0];
        assert.equal(source.method, "scrapling-http");
        assert.equal(source.pageDigest, hash(text));
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
    "default compact main wires Exa, native Jev, cached Python extraction, one Sol verify and workflow submission",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev]);
        const report = await main(env);
        assert.equal(report.researchMode, "compact");
        assert.equal(report.status, "complete");
        assert.equal(report.discovery.status, "skipped");
        assert.equal(calls.search.length, 4);
        assert.equal(
            calls.sol.length,
            1,
            "No inference turns may be spent on plan or digest submission",
        );
        assert.equal(
            calls.native.length,
            2,
            "Both source triage and route claim grading must be wired",
        );
        assert.deepEqual(calls.native[0].state.canonicalModelIds, [model.name]);
        assert.ok(
            calls.native[1].state.items.every(({ id }) =>
                id.startsWith(model.name),
            ),
        );
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
        assert.equal(report.sources[0].extractionVersion, 1);
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
        assert.equal(route.semanticAudit.length, 2);
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
        assert.equal(nativeReceipts.length, 2);
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
            assert.equal(calls.native.length, 1);
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
                    queryModels: [model.name, second.name].sort(),
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
        assert.equal(calls.native.length, 0);
        assert.equal(calls.sol.length, 0);
        assert.equal(report.calls.length, 2);
        assert.ok(report.calls.every(({ status }) => status === "received"));
        assert.equal(report.budgetUsedPollen, 0.014);
        assert.ok(
            report.calls.every(({ reserved }) => reserved < report.maxPollen),
        );
        assert.ok(
            report.budgetUsedPollen + report.calls[0].reserved >
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
        assert.equal(calls.search.length, 4);
        assert.equal(calls.native.length, 2);
        assert.equal(calls.sol.length, 1);
        assert.ok(calls.native[1].state.items.length > 0);
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
    "compact main cannot submit a Sol candidate with a quote absent from its source",
    {
        skip: !available && "Python with Scrapling unavailable",
    },
    async (t) => {
        const { out, env } = await fixture(t);
        const calls = network(t, [model, sol, jev], { absentQuote: true });
        const report = await main(env);
        assert.equal(calls.search.length, 4);
        assert.ok(calls.sol.length > 0);
        assert.equal(report.sources[0].text, text);
        assert.equal(report.status, "partial");
        assert.equal(report.models[0].status, "blocked");
        assert.ok(
            !report.models[0].actions.some(({ action }) => action === "submit"),
        );
        assert.equal(report.models[0].auditDigest, undefined);
        assert.deepEqual(
            JSON.parse(await readFile(join(out, "research.json"), "utf8")),
            report,
        );
    },
);
