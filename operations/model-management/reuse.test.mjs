import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assess } from "./researcher.mjs";
import { reuseModel } from "./reuse.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const model = {
    name: "publisher/example-v1",
    category: "text",
    community: false,
};
const guidanceDigest = hash("current guidance");
function fixture() {
    const at = new Date(Date.now() - 60000).toISOString();
    const text =
        "example-v1 available now; text and tools. Input $2.00, output $4.00 per 1M tokens.";
    const source = {
        id: "s1",
        url: "https://fireworks.ai/models",
        status: "fetched",
        text,
        digest: hash(text),
        pageDigest: hash(`${text} unchanged whole page`),
        extractionVersion: 1,
        at,
        fetchedAt: at,
        method: "scrapling-http",
        focus: "example-v1",
    };
    const searches = ["azure", "fireworks", "bedrock", "alternatives"].map(
        (scope) => ({
            scope,
            queries: [`web:exa:verify:example-v1 ${scope}`],
            at,
        }),
    );
    const payload = {
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
                        sourceId: "s1",
                        quote: "example-v1 available now",
                    },
                    {
                        kind: "availability",
                        sourceId: "s1",
                        quote: "example-v1 available now",
                    },
                    {
                        kind: "capabilities",
                        sourceId: "s1",
                        quote: "text and tools",
                    },
                    {
                        kind: "price",
                        sourceId: "s1",
                        quote: "Input $2.00, output $4.00 per 1M tokens.",
                    },
                ],
            },
        ],
        discoveries: [],
        gaps: ["Account access remains unknown"],
    };
    const row = {
        name: model.name,
        status: "researched",
        contractDigest: hash(JSON.stringify(model)),
        researchedAt: at,
        searches,
        sources: [source],
        ...assess(
            payload,
            [source],
            new Map(
                searches.map(({ scope, queries }) => [scope, new Set(queries)]),
            ),
            model,
            [model],
        ),
    };
    const previous = { guidance: { digest: guidanceDigest }, models: [row] };
    const refreshed = { ...source, fetchedAt: new Date().toISOString() };
    return { previous, row, source, refreshed };
}
const options = (fetch) => ({ guidanceDigest, inventory: [model], fetch });

test("unchanged whole-page evidence refreshes through HTTP only and preserves research/search dates", async () => {
    const { previous, row, refreshed } = fixture();
    const calls = [];
    const result = await reuseModel(
        previous,
        model,
        options(async (...args) => {
            calls.push(args);
            return refreshed;
        }),
    );
    assert.deepEqual(calls, [[refreshed.url, "http", "example-v1", 4000]]);
    assert.equal(result.reused, true);
    assert.equal(result.researchedAt, row.researchedAt);
    assert.deepEqual(result.searches, row.searches);
    assert.deepEqual(result.routes, row.routes);
    assert.equal(result.sources[0].at, refreshed.fetchedAt);
    assert.equal(result.sources[0].pageDigest, refreshed.pageDigest);
    assert.ok(
        Date.parse(result.refreshedAt) >= Date.parse(refreshed.fetchedAt),
    );
});

test("reuse preserves the original extraction window for quotes beyond 5000 characters", async () => {
    const { previous, source, refreshed } = fixture();
    const fullText = `${"Unrelated catalog details. ".repeat(220)}${source.text}`;
    assert.ok(fullText.indexOf("example-v1 available now") > 5000);
    source.text = fullText;
    source.digest = hash(fullText);
    source.pageDigest = hash(fullText);
    source.maxCharacters = 18000;
    const calls = [];
    const result = await reuseModel(
        previous,
        model,
        options(async (...args) => {
            calls.push(args);
            return {
                ...refreshed,
                text: fullText.slice(0, args[3]),
                pageDigest: source.pageDigest,
            };
        }),
    );
    assert.deepEqual(calls, [[source.url, "http", source.focus, 18000]]);
    assert.equal(result.reused, true);
    assert.equal(result.sources[0].pageDigest, source.pageDigest);
    assert.equal(result.sources[0].text, fullText);
    assert.ok(
        result.routes[0].claims.some(
            ({ quote }) => quote === "example-v1 available now",
        ),
    );
});

test("fresh refresh dates permit old research without resetting its provenance", async () => {
    const { previous, row, source, refreshed } = fixture();
    const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
    const recentDate = new Date(Date.now() - 86400000).toISOString();
    row.researchedAt = oldDate;
    row.refreshedAt = recentDate;
    source.at = recentDate;
    source.fetchedAt = recentDate;
    let calls = 0;
    const fetch = async () => {
        calls++;
        return refreshed;
    };
    const result = await reuseModel(previous, model, options(fetch));
    assert.equal(result.reused, true);
    assert.equal(result.researchedAt, oldDate);
    assert.deepEqual(result.searches, row.searches);
    assert.equal(calls, 1);
    row.refreshedAt = oldDate;
    calls = 0;
    assert.equal(await reuseModel(previous, model, options(fetch)), null);
    assert.equal(calls, 0);
});

test("shared top-level sources resolve the model's own source IDs", async () => {
    const { previous, row, source, refreshed } = fixture();
    delete row.sources;
    row.sourceIds = [source.id];
    previous.sources = [source];
    const result = await reuseModel(
        previous,
        model,
        options(async () => refreshed),
    );
    assert.equal(result.sources[0].id, source.id);
    row.sourceIds = [];
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async () => {
                throw new Error("must not fetch");
            }),
        ),
        null,
    );
});

test("changes outside the focused excerpt invalidate unchanged excerpt quotes", async () => {
    const { previous, refreshed } = fixture();
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async () => ({
                ...refreshed,
                pageDigest: hash("changed elsewhere"),
            })),
        ),
        null,
    );
});

test("model or guidance mismatch invalidates without any fetch", async () => {
    const { previous } = fixture();
    let calls = 0;
    const fetch = async () => {
        calls++;
        throw new Error("must not fetch");
    };
    assert.equal(
        await reuseModel(
            previous,
            { ...model, category: "image" },
            options(fetch),
        ),
        null,
    );
    assert.equal(
        await reuseModel(previous, model, {
            ...options(fetch),
            guidanceDigest: hash("changed guidance"),
        }),
        null,
    );
    assert.equal(calls, 0);
});

test("failed, expired, and unsupported extraction data cannot be reused", async () => {
    for (const change of [
        { status: "failed" },
        { extractionVersion: 2 },
        { pageDigest: "bad" },
        { fetchedAt: new Date(Date.now() - 31 * 86400000).toISOString() },
        { fetchedAt: "invalid" },
        { method: "pollinations-exa" },
        { url: "http://fireworks.ai/models" },
    ]) {
        const { previous, refreshed } = fixture();
        assert.equal(
            await reuseModel(
                previous,
                model,
                options(async () => ({ ...refreshed, ...change })),
            ),
            null,
        );
    }
    const { previous, source } = fixture();
    source.at = new Date(Date.now() - 31 * 86400000).toISOString();
    let calls = 0;
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async () => {
                calls++;
            }),
        ),
        null,
    );
    assert.equal(calls, 0);
    assert.equal(
        await reuseModel(
            fixture().previous,
            model,
            options(async () => {
                throw new Error("refresh failed");
            }),
        ),
        null,
    );
});

test("every original claim must still validate against the refreshed exact excerpt", async () => {
    const { previous, refreshed } = fixture();
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async () => ({
                ...refreshed,
                text: refreshed.text.replace("text and tools", "text only"),
            })),
        ),
        null,
    );
});

test("missing referenced sources and foreign search coverage invalidate before refresh", async () => {
    const { previous, row } = fixture();
    let calls = 0;
    const fetch = async () => {
        calls++;
    };
    row.discoveries = [
        {
            name: "new-provider",
            kind: "provider",
            reason: "Current lead",
            sourceIds: ["missing"],
        },
    ];
    assert.equal(await reuseModel(previous, model, options(fetch)), null);
    row.discoveries = [];
    row.searches = row.searches.filter(({ scope }) => scope !== "azure");
    previous.searches = [{ scope: "azure", queries: ["foreign model"] }];
    assert.equal(await reuseModel(previous, model, options(fetch)), null);
    assert.equal(calls, 0);
});

test("reuse cannot promote historical unverified routes to documented", async () => {
    const { previous, row, refreshed } = fixture();
    row.routes[0].verification = "unverified";
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async () => refreshed),
        ),
        null,
    );
});

test("every discovery reference also needs an unchanged full-page digest", async () => {
    const { previous, row, source, refreshed } = fixture();
    const second = {
        ...source,
        id: "s2",
        url: "https://fireworks.ai/new-provider",
    };
    row.sources.push(second);
    row.discoveries = [
        {
            name: "new-provider",
            kind: "provider",
            reason: "Current lead",
            sourceIds: ["s1", "s2"],
        },
    ];
    const calls = [];
    assert.equal(
        await reuseModel(
            previous,
            model,
            options(async (url) => {
                calls.push(url);
                return url === source.url
                    ? refreshed
                    : {
                          ...second,
                          pageDigest: hash("changed discovery page"),
                          fetchedAt: refreshed.fetchedAt,
                      };
            }),
        ),
        null,
    );
    assert.deepEqual(calls, [source.url, second.url]);
});
