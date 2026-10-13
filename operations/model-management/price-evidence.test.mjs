import assert from "node:assert/strict";
import test from "node:test";
import { exactModelIdentity, extractPrices } from "./price-evidence.mjs";

// Exact short excerpts from saved s106, s9 and s22; no network fixtures.
const table = `Prices per 1M tokens.
Standard
### Standard pricing data
| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.4-mini | $0.75 | $0.075 | - | $4.50 | - | - | - | - |
| gpt-5.4-nano | $0.20 | $0.02 | - | $1.25 | - | - | - | - |`;
const nano = {
    model: "gpt-5.4-nano",
    upstreamModel: "gpt-5.4-nano",
    category: "text",
    quote: "| gpt-5.4-nano | $0.20 | $0.02 | - | $1.25 | - | - | - | - |",
};
const embedding = {
    model: "qwen3-embedding-8b",
    upstreamModel: "Qwen/Qwen3-Embedding-8B",
    category: "embedding",
};
const fireworks = `Qwen3 Embedding 8B API & Playground | Fireworks
model path:accounts/fireworks/models/qwen3-embedding-8b
Qwen3 Embedding 8B API Features
Serverless
Docs
Qwen3 Embedding 8B is available via Fireworks' serverless API, where you pay per token. There are several ways to call the Fireworks API, including Fireworks' Python client, the REST API, or OpenAI's Python client.
On-demand Deployment
Docs
On-demand deployments allow you to use Qwen3 Embedding 8B on dedicated GPUs with Fireworks' high-performance serving stack with high reliability and no rate limits.
Available Serverless
Run queries immediately, pay only for usage
$0.10
Per 1M Tokens`;
const deepinfra = `Qwen3 Embedding 8B API - Documentation - DeepInfra
Models
Embeddings
Qwen/
Qwen3-Embedding-8B
$0.010
/ 1M tokens`;

function verifyPositions(source, result) {
    assert.ok(result);
    for (const fragment of result.evidence) {
        assert.equal(
            source.slice(fragment.start, fragment.end),
            fragment.quote,
        );
        assert.ok(fragment.quote.split(/\s+/).length <= 25);
    }
}

test("saved nano table associates exact row with uncached input/output headings and unit", () => {
    const result = extractPrices(table, nano);
    assert.equal(result.input, 0.2);
    assert.equal(result.output, 1.25);
    assert.deepEqual(result.conditions, ["short context"]);
    assert.equal(result.currency, "USD");
    assert.equal(result.unit, "1M_tokens");
    verifyPositions(table, result);
});

test("neighbor checkpoint and neighboring row quote cannot supply nano's prices", () => {
    assert.equal(
        extractPrices(table.replaceAll("gpt-5.4-nano", "gpt-5.4-nano-2027"), {
            ...nano,
            quote: undefined,
        }),
        null,
    );
    assert.equal(
        extractPrices(table, {
            ...nano,
            quote: "| gpt-5.4-mini | $0.75 | $0.075 | - | $4.50 | - | - | - | - |",
        }),
        null,
    );
    assert.equal(
        extractPrices(table, {
            ...nano,
            upstreamModel: "gpt-5.4-pro",
            model: "gpt-5.4-pro",
            quote: undefined,
        }),
        null,
    );
});

test("cached output is never standard output and cached price is not selected", () => {
    assert.equal(extractPrices(table, { ...nano, quote: "$0.02" }), null);
    assert.equal(
        extractPrices(table, {
            ...nano,
            upstreamModel: "gpt-5.4-pro",
            quote: undefined,
        }),
        null,
    );
    assert.equal(
        extractPrices(
            table.replace(
                "Short context output",
                "Short context cached output",
            ),
            nano,
        ),
        null,
    );
    assert.equal(
        extractPrices(
            table.replace(
                "Short context input |",
                "Short context cached input |",
            ),
            nano,
        ),
        null,
    );
});

test("omitted unit, mismatched groups and nonadjacent unrelated unit are unknown", () => {
    assert.equal(
        extractPrices(table.replace("Prices per 1M tokens.", "Prices"), nano),
        null,
    );
    assert.equal(
        extractPrices(
            table.replace("Short context output", "Long context output"),
            nano,
        ),
        null,
    );
    assert.equal(
        extractPrices(
            table.replace("Standard\n", "Other product\nStandard\n"),
            nano,
        ),
        null,
    );
    assert.equal(
        extractPrices(table.replace("Short context input", "Price"), nano),
        null,
    );
});

test("batch, promotional, non-USD and bare numeric table prices are unknown", () => {
    for (const source of [
        table.replace("Standard\n", "Batch\n"),
        table.replace("Standard pricing data", "Promotional pricing data"),
        table.replaceAll("$", "CAD $"),
        table.replaceAll("$", "CA$"),
        table.replaceAll("$", "€"),
        table.replaceAll("$", ""),
        table.replace("Prices per 1M tokens.", "Prices in EUR per 1M tokens."),
    ])
        assert.equal(
            extractPrices(source, { ...nano, quote: undefined }),
            null,
        );
});

test("multiple numeric context pairs are ambiguous", () => {
    const source = table.replace(
        "$1.25 | - | - | - | -",
        "$1.25 | $0.40 | - | - | $2.50",
    );
    assert.equal(extractPrices(source, { ...nano, quote: undefined }), null);
});

test("saved DeepInfra input-only embedding price has null output and exact provenance", () => {
    const result = extractPrices(deepinfra, {
        ...embedding,
        quote: "$0.010\n/ 1M tokens",
    });
    assert.equal(result.input, 0.01);
    assert.equal(result.output, null);
    verifyPositions(deepinfra, result);
    assert.equal(
        extractPrices(deepinfra, { ...embedding, category: "text" }),
        null,
    );
});

test("saved Fireworks model page serverless price has null output", () => {
    for (const source of [
        fireworks,
        fireworks.replace("Available Serverless", "### Available Serverless"),
    ]) {
        const result = extractPrices(source, {
            ...embedding,
            quote: "$0.10\nPer 1M Tokens",
        });
        assert.equal(result.input, 0.1);
        assert.equal(result.output, null);
        verifyPositions(source, result);
    }
});

test("embedding neighbors, missing units, cached or wrong-currency blocks are rejected", () => {
    for (const source of [
        deepinfra.replace("Qwen3-Embedding-8B\n$", "Qwen3-Embedding-4B\n$"),
        deepinfra.replace("/ 1M tokens", "per request"),
        deepinfra.replace("$0.010", "CAD $0.010"),
        deepinfra.replace("$0.010", "$0.010 cached"),
        fireworks.replace(
            "Qwen3 Embedding 8B API &",
            "Qwen3 Embedding 4B API &",
        ),
        fireworks.replace("Available Serverless", "Available Batch"),
        fireworks.replace(
            "models/qwen3-embedding-8b",
            "models/qwen3-embedding-4b",
        ),
        fireworks.replace("Per 1M Tokens", "Per Token"),
    ])
        assert.equal(extractPrices(source, embedding), null);
});

test("inline slash token units are input-only and remain bound to exact model", () => {
    const source = "Qwen3-Embedding-8B\n$0.010 / 1M tokens";
    const result = extractPrices(source, embedding);
    assert.equal(result.input, 0.01);
    assert.equal(result.output, null);
    verifyPositions(source, result);
    assert.equal(
        extractPrices(source, { ...embedding, quote: "$0.011 / 1M tokens" }),
        null,
    );
});

test("CRLF embedding evidence retains the exact source bytes", () => {
    const source = deepinfra.replaceAll("\n", "\r\n");
    verifyPositions(source, extractPrices(source, embedding));
});

test("scope before table unit rejects restricted sections and foreign currencies", () => {
    const source =
        "Prices per 1M tokens USD\n| Model | Input | Output |\n| --- | --- | --- |\n| gpt-5.4-nano | $0.20 | $1.25 |";
    for (const prefix of [
        "# Batch pricing",
        "Only for requests below 128K tokens.",
        "Promotional prices until tomorrow.",
        "Prices in CAD",
        "Prices in SGD",
        "# Trial pricing",
    ]) {
        assert.equal(
            extractPrices(`${prefix}\n${source}`, {
                ...nano,
                quote: undefined,
            }),
            null,
            prefix,
        );
    }
    const reset = `# Batch pricing\n# Standard pricing\n${source}`;
    verifyPositions(reset, extractPrices(reset, { ...nano, quote: undefined }));
    assert.equal(
        extractPrices(
            `# Batch pricing\n${"Neutral text\n".repeat(20)}${source}`,
            { ...nano, quote: undefined },
        ),
        null,
    );
});

test("direct embedding blocks respect preceding batch, promotional and currency scope", () => {
    const source = "Qwen3-Embedding-8B\n$0.01 / 1M tokens";
    for (const prefix of [
        "Batch",
        "Promotional",
        "Prices in CAD",
        "Prices in AUD",
        "Only for requests below 128K tokens.",
    ]) {
        assert.equal(
            extractPrices(`${prefix}\n${source}`, embedding),
            null,
            prefix,
        );
    }
    const reset = `Batch\nStandard\n${source}`;
    verifyPositions(reset, extractPrices(reset, embedding));
});

test("embedding table input-only price preserves null output and refuses output columns", () => {
    const source =
        "Standard\nPrices per 1M tokens USD\n| Model | Input | Cached input |\n| --- | --- | --- |\n| Qwen3-Embedding-8B | $0.010 | $0.001 |";
    const result = extractPrices(source, embedding);
    assert.equal(result.input, 0.01);
    assert.equal(result.output, null);
    verifyPositions(source, result);
    assert.equal(
        extractPrices(source, { ...embedding, category: "text" }),
        null,
    );
    assert.equal(
        extractPrices(source.replace("Cached input", "Output"), embedding),
        null,
    );
    assert.equal(
        extractPrices(
            source.replace("Cached input", "Cached output"),
            embedding,
        ),
        null,
    );
});

// Exact layout refetched from https://docs.fireworks.ai/serverless/pricing.
const orderedTable = `## Text and vision models
Per-model pricing for headline models. Fast variants appear as adjacent rows. In each Standard or Priority cell, prices are input / cached input / output (USD per 1M tokens), in that order.
| Model | Standard | Priority |
| --- | --- | --- |
| Kimi K3 | $3.00 / $0.30 / $15.00 | $3.75 / $0.375 / $18.75 |
| Kimi K3 Fast | $4.50 / $0.45 / $22.50 | — |
| Kimi K3 (US) | $4.50 / $0.45 / $22.50 | $5.625 / $0.5625 / $28.125 |`;

test("observed ordered standard cell selects input/output with exact offsets", () => {
    const options = { upstreamModel: "kimi-k3", category: "text" };
    const result = extractPrices(orderedTable, options);
    assert.equal(result.input, 3);
    assert.equal(result.output, 15);
    assert.deepEqual(result.conditions, ["standard"]);
    verifyPositions(orderedTable, result);
    for (const quote of ["$0.30", "$3.75", "$22.50"])
        assert.equal(extractPrices(orderedTable, { ...options, quote }), null);
    for (const source of [
        orderedTable.replace(
            "input / cached input / output",
            "output / cached input / input",
        ),
        orderedTable.replace("USD per 1M tokens", "CAD per 1M tokens"),
        orderedTable.replace("USD per 1M tokens", "USD per tokens"),
        orderedTable.replace("| Standard |", "| Batch |"),
        orderedTable.replace(
            "## Text and vision models",
            "## Promotional pricing",
        ),
        orderedTable.replace(
            "## Text and vision models",
            "Only for requests below 128K tokens.",
        ),
        orderedTable.replace("| Kimi K3 |", "| Kimi K3 Fast |"),
    ])
        assert.equal(extractPrices(source, options), null);
});

test("formatting equivalence preserves full checkpoint versions and suffixes", () => {
    assert.equal(exactModelIdentity("Kimi K3", "kimi-k3"), true);
    assert.equal(
        exactModelIdentity("# Qwen3-Embedding-8B", "Qwen/Qwen3-Embedding-8B"),
        true,
    );
    for (const value of [
        "kimi-k3-fast",
        "kimi-k3-us",
        "kimi-k3-2026",
        "kimi-k3.1",
        "kimi-k-3",
    ])
        assert.equal(exactModelIdentity(value, "kimi-k3"), false);
});

test("nested standard sections retain ancestor currency and billing restrictions", () => {
    const source =
        "Prices per 1M tokens USD\n| Model | Input | Output |\n| --- | --- | --- |\n| gpt-5.4-nano | $0.20 | $1.25 |";
    for (const heading of [
        "Prices in CAD",
        "Prices in EUR",
        "Batch pricing",
        "Only for requests below 128K tokens.",
    ]) {
        assert.equal(
            extractPrices(`# ${heading}\n## Standard\n${source}`, {
                ...nano,
                quote: undefined,
            }),
            null,
        );
    }
    const reset = `# Prices in CAD\n# Standard\n${source}`;
    verifyPositions(reset, extractPrices(reset, { ...nano, quote: undefined }));
});

test("compound time or request billing units remain unknown", () => {
    for (const suffix of [" per hour", " per request", " / day", " per second"])
        assert.equal(
            extractPrices(
                table.replace(
                    "Prices per 1M tokens.",
                    `USD per 1M tokens${suffix}`,
                ),
                { ...nano, quote: undefined },
            ),
            null,
        );
});

test("plain currency scope survives Standard until a section boundary", () => {
    const source =
        "per 1M tokens\n| Model | Input | Output |\n| --- | --- | --- |\n| gpt-5.4-nano | $1 | $2 |";
    assert.equal(
        extractPrices(`Prices in CAD\nStandard\n${source}`, {
            ...nano,
            quote: undefined,
        }),
        null,
    );
    assert.equal(
        extractPrices(`# Parent\nPrices in CAD\n## Standard\n${source}`, {
            ...nano,
            quote: undefined,
        }),
        null,
    );
    const reset = `# CAD section\nPrices in CAD\n# Standard\n${source}`;
    verifyPositions(reset, extractPrices(reset, { ...nano, quote: undefined }));
    const usd = source.replace("per 1M tokens", "Prices per 1M tokens (USD).");
    verifyPositions(usd, extractPrices(usd, { ...nano, quote: undefined }));
});
