import assert from "node:assert/strict";
import test from "node:test";
import {
    assess,
    officialCatalog,
    research,
    sourceText,
} from "./researcher.mjs";

const model = {
    name: "publisher/example-v1",
    aliases: ["example"],
    category: "text",
    community: false,
};
const scopes = new Map(
    ["azure", "fireworks", "bedrock", "alternatives"].map((scope) => [
        scope,
        new Set([`web:exa:challenge:example-v1 ${scope}`]),
    ]),
);
const evidence = (
    text,
    url = "https://learn.microsoft.com/models",
    at = new Date().toISOString(),
) => ({ id: "s1", status: "fetched", url, text, at });
const route = (overrides = {}) => ({
    provider: "azure",
    providerWebsite: "https://azure.com",
    upstreamModel: "example-v1",
    exactMatch: true,
    available: true,
    capabilitiesMatch: true,
    creditEligibility: "unknown",
    pricing: { currency: "USD", unit: "1M_tokens", input: 2, output: 4 },
    claims: [
        { kind: "identity", sourceId: "s1", quote: "example-v1 available now" },
        {
            kind: "availability",
            sourceId: "s1",
            quote: "example-v1 available now",
        },
        { kind: "capabilities", sourceId: "s1", quote: "text and tools" },
        {
            kind: "price",
            sourceId: "s1",
            quote: "Input $2.00, output $4.00 per 1M tokens.",
        },
    ],
    ...overrides,
});
const text =
    "example-v1 available now; text and tools. Input $2.00, output $4.00 per 1M tokens.";
function assessRoute(candidate, source = evidence(text)) {
    return assess(
        { routes: [candidate], discoveries: [], gaps: [] },
        [source],
        scopes,
        model,
        [model],
    );
}
function mustNotRecommend(candidate, source, expectedValidation) {
    let result;
    try {
        result = assessRoute(candidate, source);
    } catch (error) {
        assert.ok(
            expectedValidation,
            "Unexpected exception during evidence assessment",
        );
        assert.ok(error instanceof assert.AssertionError);
        assert.match(error.message, expectedValidation);
        return;
    }
    assert.equal(
        result.recommendation,
        null,
        "Unrelated or contradicted evidence must not recommend a route",
    );
}
function mustNotDocument(candidate, source) {
    const result = assessRoute(candidate, source);
    assert.equal(
        result.routes[0].verification,
        "unverified",
        "Unsupported factual claims must stay unverified",
    );
}

test("valid complete primary evidence remains accepted", () => {
    const result = assessRoute(route());
    assert.equal(result.routes[0].verification, "documented");
    assert.equal(result.recommendation.provider, "azure");
});

test("malformed official identities cannot enter the backfill inventory", () => {
    for (const row of [
        { community: false },
        { name: " ", community: false },
        { ...model, aliases: [null] },
    ]) {
        assert.throws(() => officialCatalog([row]), /official model identity/);
    }
});

test("unsupported numeric prices are exported as unknown", () => {
    const result = assessRoute(
        route({
            pricing: {
                currency: "USD",
                unit: "1M_tokens",
                input: 7,
                output: 8,
            },
        }),
    );
    assert.equal(result.routes[0].verification, "unverified");
    assert.equal(result.routes[0].pricing.input, null);
    assert.equal(result.routes[0].pricing.output, null);
});

test("different checkpoint cannot be asserted equivalent to the requested official model", () => {
    const candidate = route({ upstreamModel: "example-v2" });
    candidate.claims = candidate.claims.map((claim) => ({
        ...claim,
        quote: claim.quote.replaceAll("example-v1", "example-v2"),
    }));
    mustNotRecommend(
        candidate,
        evidence(text.replaceAll("example-v1", "example-v2")),
    );
});

test("identity substring cannot turn example-v10 into exact example-v1 evidence", () => {
    const candidate = route();
    candidate.claims[0].quote = "example-v10 available now";
    candidate.claims[1].quote = "example-v10 available now";
    mustNotRecommend(
        candidate,
        evidence(text.replaceAll("example-v1", "example-v10")),
    );
});

test("provider page explicitly denying availability cannot prove availability", () => {
    const candidate = route();
    candidate.claims[1].quote = "example-v1 is not available";
    mustNotRecommend(
        candidate,
        evidence(`${text} example-v1 is not available.`),
    );
});

test("another checkpoint's prices and capabilities cannot document this route", () => {
    const source = evidence(
        "example-v1 available now. example-v2 supports text and tools. example-v2: Input $2.00, output $4.00 per 1M tokens.",
    );
    mustNotDocument(route(), source);
});

test("version numerals are not price evidence", () => {
    const candidate = route();
    candidate.claims[3].quote = "example-v2 and example-v4 are available";
    mustNotDocument(
        candidate,
        evidence(
            `${text.split("Input")[0]} example-v2 and example-v4 are available.`,
        ),
    );
});

test("input and output prices cannot be swapped while reusing the same quote", () => {
    mustNotDocument(
        route({
            pricing: {
                currency: "USD",
                unit: "1M_tokens",
                input: 4,
                output: 2,
            },
        }),
    );
});

test("million-token quote cannot document per-request pricing", () => {
    mustNotDocument(
        route({
            provider: "other",
            providerWebsite: "https://learn.microsoft.com",
            pricing: {
                currency: "USD",
                unit: "request",
                input: 2,
                output: null,
            },
        }),
    );
});

test("explicitly obsolete offer must not recommend a current route", () => {
    mustNotRecommend(
        route(),
        evidence(
            `Historical catalog from 2020; this offer was retired in 2021. ${text}`,
            undefined,
            "2020-01-01T00:00:00Z",
        ),
    );
});

test("community-hosted alternative cannot nominate itself as a primary provider", () => {
    mustNotRecommend(
        route({
            provider: "other",
            providerWebsite: "https://github.com/sample",
        }),
        evidence(text, "https://github.com/sample/pricing"),
        /^Community platform is not a primary provider source$/,
    );
});

test("insecure provider identity cannot be accepted as official HTTPS provenance", () => {
    mustNotRecommend(
        route({ providerWebsite: "http://azure.com" }),
        undefined,
        /^Provider HTTPS provenance required$/,
    );
});

test("discovery cannot replace required Hugging Face and Replit modes with arbitrary modes", () => {
    const discoveryScopes = new Map([
        [
            "discovery",
            new Set([
                "reddit:exa:challenge:a",
                "github:exa:explore:b",
                "news:exa:explore:c",
                "web:exa:explore:d",
            ]),
        ],
    ]);
    assert.throws(() =>
        assess(
            { routes: [], discoveries: [], gaps: [] },
            [{ ...evidence(text), method: "scrapling-http" }],
            discoveryScopes,
            null,
            [model],
        ),
    );
});

test("structured crawler failure is not usable fetched page text", () => {
    assert.throws(() =>
        sourceText(
            JSON.stringify({
                error: "Fetch failed: upstream unavailable",
                detail: "No page body was returned by the crawler",
            }),
        ),
    );
});

test("empty queries cannot satisfy preferred-provider and challenge coverage in the real loop", async () => {
    const calls = [
        [
            "research",
            {
                action: "plan",
                questions: [
                    "Which model is available?",
                    "What is the current price?",
                    "What contradicts the offer?",
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
                purpose: "challenge",
                query: "   ",
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
                infer: async () => {
                    const [name, args] = calls[index++];
                    return {
                        role: "assistant",
                        tool_calls: [
                            {
                                id: `c${index}`,
                                type: "function",
                                function: {
                                    name,
                                    arguments: JSON.stringify(args),
                                },
                            },
                        ],
                    };
                },
                search: async () => "No evidence",
            },
            [model],
            calls.length,
        ),
    );
});

test("malformed tool messages fail closed and preserve accumulated evidence", async () => {
    const questions = [
        "Which model is available?",
        "What is the current price?",
        "What contradicts the offer?",
    ];
    const calls = [
        [
            "research",
            {
                action: "plan",
                questions,
                routes: [],
                discoveries: [],
                gaps: [],
            },
        ],
        [
            "search",
            {
                scope: "azure",
                engine: "exa",
                mode: "web",
                purpose: "challenge",
                query: "example-v1 azure availability",
            },
        ],
    ];
    let index = 0;
    let searches = 0;
    await assert.rejects(
        research(
            { model },
            {
                infer: async () => {
                    if (index === calls.length)
                        return {
                            role: "assistant",
                            tool_calls: [{ id: "malformed" }],
                        };
                    const [name, args] = calls[index++];
                    return {
                        role: "assistant",
                        tool_calls: [
                            {
                                id: `c${index}`,
                                type: "function",
                                function: {
                                    name,
                                    arguments: JSON.stringify(args),
                                },
                            },
                        ],
                    };
                },
                search: async () => {
                    searches++;
                    return "No matching offer in the current catalog";
                },
            },
            [model],
            3,
        ),
        (error) => {
            assert.ok(error instanceof TypeError);
            assert.equal(searches, 1);
            assert.deepEqual(error.evidence.plans[0].questions, questions);
            assert.deepEqual(error.evidence.searches, [
                {
                    scope: "azure",
                    queries: [
                        "web:exa:challenge:example-v1 azure availability",
                    ],
                },
            ]);
            return true;
        },
    );
});

test("co-mentioned checkpoints cannot imply that an upstream version equals the requested version", () => {
    const candidate = route({ upstreamModel: "example-v2" });
    candidate.claims[0].quote = "example-v1 and example-v2 available now";
    candidate.claims[1].quote = "example-v2 available now";
    mustNotRecommend(
        candidate,
        evidence(
            "example-v1 and example-v2 available now; text and tools. Input $2.00, output $4.00 per 1M tokens.",
        ),
    );
});

test("thousands separator cannot reduce an input price from one thousand dollars to one dollar", () => {
    const candidate = route({
        pricing: { currency: "USD", unit: "1M_tokens", input: 1, output: 4 },
    });
    candidate.claims[3].quote = "Input $1,000, output $4.00 per 1M tokens.";
    mustNotDocument(
        candidate,
        evidence(
            "example-v1 available now; text and tools. Input $1,000, output $4.00 per 1M tokens.",
        ),
    );
});

test("cached-input discount cannot document the general input price", () => {
    const candidate = route({
        pricing: { currency: "USD", unit: "1M_tokens", input: 0.1, output: 4 },
    });
    candidate.claims[3].quote =
        "Cached input $0.10, regular input $2.00, output $4.00 per 1M tokens.";
    mustNotDocument(
        candidate,
        evidence(
            "example-v1 available now; text and tools. Cached input $0.10, regular input $2.00, output $4.00 per 1M tokens.",
        ),
    );
});
