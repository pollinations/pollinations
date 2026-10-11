import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assess, main, modelContract } from "./researcher.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const model = {
    name: "publisher/example-v1",
    category: "text",
    community: false,
    health: { requests: 1 },
};
const inference = {
    name: "openai/gpt-6.1-sol",
    community: false,
    paid_only: false,
    category: "text",
    pricing: { promptTextTokens: 0.000002, completionTextTokens: 0.00001 },
};

test("main reuses valid rows from a partial artifact through free HTTP and researches changed contracts", async (t) => {
    const exitCode = process.exitCode;
    t.after(() => {
        t.mock.restoreAll();
        syncBuiltinESMExports();
        process.exitCode = exitCode;
    });
    const root = await mkdtemp(join(tmpdir(), "research-reuse-integration-"));
    const envFor = (name) => ({
        POLLINATIONS_API_KEY: "test-runtime-key",
        MODELS: model.name,
        MAX_POLLEN: "1",
        RESEARCH_OUT: join(root, name),
    });
    let current = structuredClone(model);
    const paidContexts = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url === "https://gen.pollinations.ai/models?reliability=all")
            return Response.json([current, inference]);
        if (url === "https://gen.pollinations.ai/mcp")
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
        assert.equal(
            url,
            "https://gen.pollinations.ai/v1/chat/completions",
            "Reuse must never perform paid search or page fetch",
        );
        const payload = JSON.parse(options.body);
        paidContexts.push(JSON.parse(payload.messages[1].content));
        return Response.json({
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "No usable research action",
                    },
                },
            ],
        });
    });
    const first = await main(envFor("first"));
    assert.ok(first.guidance.digest);
    assert.ok(
        paidContexts.some((context) =>
            context.models?.some(({ name }) => name === model.name),
        ),
    );
    const oldAt = new Date(Date.now() - 86400000).toISOString();
    const text =
        "example-v1 available now; text and tools. Input $2.00, output $4.00 per 1M tokens.";
    const page = `${text}\nAn unrelated whole-page footer remains unchanged.`;
    const source = {
        id: "shared-source",
        url: "https://fireworks.ai/models",
        status: "fetched",
        method: "scrapling-http",
        text,
        digest: hash(text),
        pageDigest: hash(page),
        extractionVersion: 1,
        at: oldAt,
        fetchedAt: oldAt,
        focus: "example-v1",
        excerptStart: 0,
        totalCharacters: page.length,
        focusMatched: true,
    };
    const searches = ["azure", "fireworks", "bedrock", "alternatives"].map(
        (scope) => ({
            scope,
            queries: [`web:exa:verify:example-v1 ${scope}`],
            at: oldAt,
        }),
    );
    const candidate = {
        routes: [
            {
                provider: "fireworks",
                providerWebsite: "https://fireworks.ai",
                upstreamModel: "example-v1",
                exactMatch: true,
                available: true,
                capabilitiesMatch: true,
                creditEligibility: "unknown",
                pricing: {
                    currency: "USD",
                    unit: "1M_tokens",
                    input: 2,
                    output: 4,
                },
                claims: [
                    {
                        kind: "identity",
                        sourceId: source.id,
                        quote: "example-v1 available now",
                    },
                    {
                        kind: "availability",
                        sourceId: source.id,
                        quote: "example-v1 available now",
                    },
                    {
                        kind: "capabilities",
                        sourceId: source.id,
                        quote: "text and tools",
                    },
                    {
                        kind: "price",
                        sourceId: source.id,
                        quote: "Input $2.00, output $4.00 per 1M tokens.",
                    },
                ],
            },
        ],
        discoveries: [],
        gaps: ["Account verification remains unknown"],
    };
    const row = {
        name: model.name,
        status: "researched",
        researchedAt: oldAt,
        contractDigest: hash(JSON.stringify(modelContract(model))),
        searches,
        sourceIds: [source.id],
        ...assess(
            candidate,
            [source],
            new Map(
                searches.map(({ scope, queries }) => [scope, new Set(queries)]),
            ),
            modelContract(model),
            [model, inference],
        ),
    };
    const previous = join(root, "previous.json");
    await writeFile(
        previous,
        JSON.stringify({
            ...first,
            status: "partial",
            models: [row],
            sources: [source],
        }),
    );
    const refreshes = [];
    const refreshedAt = new Date().toISOString();
    t.mock.method(childProcess, "execFile", (file, args, options) => {
        assert.equal(file, "python");
        assert.ok(args[0].endsWith("fetch.py"));
        assert.equal(options.env.POLLINATIONS_API_KEY, undefined);
        assert.equal(
            options.env.FETCH_CACHE_DIR,
            join(root, "second", "pages"),
        );
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stdin = {
            end(input) {
                refreshes.push(JSON.parse(input));
                queueMicrotask(() => {
                    child.stdout.emit(
                        "data",
                        JSON.stringify({
                            ...source,
                            fetchedAt: refreshedAt,
                            cached: false,
                        }),
                    );
                    child.emit("close", 0);
                });
            },
        };
        return child;
    });
    syncBuiltinESMExports();
    paidContexts.length = 0;
    current.health.requests = 999;
    const second = await main({
        ...envFor("second"),
        PREVIOUS_RESEARCH: previous,
    });
    assert.equal(
        second.models[0].reused,
        true,
        "Removing main's reuse call must fail this assertion",
    );
    assert.equal(second.models[0].status, "researched");
    assert.equal(
        paidContexts.filter((context) => context.models).length,
        0,
        "Unchanged model must bypass grouped paid inference",
    );
    assert.deepEqual(refreshes, [
        {
            url: source.url,
            mode: "http",
            maxCharacters: 4000,
            focus: source.focus,
        },
    ]);
    assert.equal(second.models[0].researchedAt, oldAt);
    assert.deepEqual(second.models[0].searches, searches);
    assert.deepEqual(second.models[0].routes[0].claims, row.routes[0].claims);
    const persisted = JSON.parse(
        await readFile(join(root, "second", "research.json"), "utf8"),
    );
    const refreshed = persisted.models[0].sources[0];
    assert.equal(refreshed.at, refreshedAt);
    assert.equal(refreshed.fetchedAt, refreshedAt);
    assert.equal(refreshed.pageDigest, hash(page));
    assert.equal(refreshed.digest, hash(text));
    assert.equal(refreshed.extractionVersion, 1);
    assert.equal(refreshed.cached, false);
    assert.ok(
        Date.parse(persisted.models[0].refreshedAt) >= Date.parse(refreshedAt),
    );
    paidContexts.length = 0;
    current = { ...current, aliases: ["changed-contract-alias"] };
    const third = await main({
        ...envFor("third"),
        PREVIOUS_RESEARCH: previous,
    });
    assert.ok(
        paidContexts.some((context) =>
            context.models?.some(({ name }) => name === model.name),
        ),
        "Changed model must enter grouped research",
    );
    assert.equal(third.models[0].reused, undefined);
    assert.equal(
        refreshes.length,
        1,
        "Contract mismatch must avoid HTTP refresh",
    );
});
