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

test("current Claude base-input/output-token columns retain MTok units", () => {
    const page = `## Model pricing
| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| --- | --- | --- | --- | --- | --- |
| Claude Sonnet 4.6 | $3 / MTok | $3.75 / MTok | $6 / MTok | $0.30 / MTok | $15 / MTok |`;
    const options = { upstreamModel: "claude-sonnet-4.6", category: "text" };
    const result = extractPrices(page, options);
    verifyPositions(page, result);
    assert.equal(result.input, 3);
    assert.equal(result.output, 15);
    assert.equal(
        extractPrices(page.replaceAll("/ MTok", "/ 1K tokens"), options),
        null,
    );
});

test("public routed-model JSON normalizes per-token prices without inventing missing prices or direct-provider billing", () => {
    const page = JSON.stringify({
        data: {
            id: "qwen/qwen3-coder-next",
            pricing: {
                prompt: "0.00000012",
                completion: "0.0000008",
                input_cache_read: "0.00000007",
            },
        },
    });
    const options = {
        upstreamModel: "qwen/qwen3-coder-next",
        category: "text",
        sourceUrl: "https://openrouter.ai/api/v1/model/qwen/qwen3-coder-next",
    };
    const result = extractPrices(page, options);
    verifyPositions(page, result);
    assert.equal(result.input, 0.12);
    assert.equal(result.output, 0.8);
    assert.ok(result.conditions.some((x) => x.includes("fees")));
    for (const invalid of [
        page.replace('"0.0000008"', "null"),
        page.replace('"0.0000008"', '"-1"'),
        page.replace("qwen3-coder-next", "qwen3-coder-next-2027"),
    ])
        assert.equal(extractPrices(invalid, options), null);
    assert.equal(
        extractPrices(page, {
            ...options,
            sourceUrl: "https://other.example/model/qwen/qwen3-coder-next",
        }),
        null,
    );
});

test("actual model-page title and cached input component do not hide low/medium image prices", () => {
    const page = `GPT-Image-1.5 Model | OpenAI API
Image tokens
Per 1M tokens
Input
$8.00
Cached input
$2.00
Output
$32.00
Image generation
Per image
Quality
Low
1024x1024
$0.009
Image generation
Per image
Quality
Medium
1024x1024
$0.034
Image generation
Per image
Quality
High
1024x1024
$0.133`;
    const result = extractPrices(page, {
        upstreamModel: "gpt-image-1.5",
        category: "image",
    });
    verifyPositions(page, result);
    assert.deepEqual(
        result.variants.map((x) => x.input),
        [0.009, 0.034, 0.133],
    );
});

test("vertical text tables keep text output apart from audio input and cached/priority prices", () => {
    const page = `### Gemini models
| Model | Type | Price (/1M tokens) <= 200K input tokens | Price (/1M tokens) > 200K input tokens | Price (/1M cached input tokens) |
| --- | --- | --- | --- | --- |
| Gemini 2.5 Flash Lite | Input (text, image, video) | $0.10 | $0.10 | $0.01 |
| | Audio Input | $0.30 | $0.30 | $0.03 |
| | Text output (response and reasoning) | $0.40 | $0.40 | N/A |`;
    const result = extractPrices(page, {
        upstreamModel: "gemini-2.5-flash-lite",
        category: "text",
    });
    verifyPositions(page, result);
    assert.equal(result.input, 0.1);
    assert.equal(result.output, 0.4);
    assert.equal(result.variants.length, 2);
    assert.ok(result.conditions[0].includes("200K"));
});

test("video row spans keep source count units and audio/resolution scenarios separate", () => {
    const page = `### Veo
| Model | Feature | Description | Input | Output | Output Resolution | Price (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| Veo 3.1 Fast | Video + Audio generation | Generate videos | Text/Image prompt | Video + Audio | 720p | $0.10 / 1 count |
| | | | | | 1080p | $0.12 / 1 count |
| | Video generation | Generate videos | Text/Image prompt | Video | 720p | $0.08 / 1 count |
| Veo 3.1 Lite | Video generation | Generate videos | Text/Image prompt | Video | 720p | $0.03 / 1 count |`;
    const result = extractPrices(page, {
        upstreamModel: "veo-3.1-fast",
        category: "video",
    });
    verifyPositions(page, result);
    assert.equal(result.unit, "count");
    assert.deepEqual(
        result.variants.map((x) => x.input),
        [0.1, 0.12, 0.08],
    );
    assert.ok(result.variants[2].conditions.includes("Output: Video"));
    assert.ok(
        result.conditions.some((x) =>
            x.includes("duration mapping remains unverified"),
        ),
    );
});

test("tiered publisher prices retain deployment, prompt length and region instead of universal savings", () => {
    const page = `### Singapore
| Model ID | Deployment scope | Input tokens per request | Input price (per 1 million tokens) | Output price (per 1 million tokens) |
| --- | --- | --- | --- | --- |
| qwen3-coder-next | International | 0<Token≤32K | $0.3 | $1.5 |`;
    const result = extractPrices(page, {
        upstreamModel: "qwen3-coder-next",
        category: "text",
    });
    verifyPositions(page, result);
    assert.equal(result.input, 0.3);
    assert.equal(result.output, 1.5);
    assert.ok(result.conditions.some((x) => x.includes("0<Token≤32K")));
    assert.ok(result.conditions.some((x) => x.includes("International")));
    assert.ok(result.conditions.some((x) => x.includes("Singapore")));
});

test("image model cards preserve every quality/resolution rate and reject an unbound calculator", () => {
    const page = `# GPT Image 1.5
Image generation
Per image
Quality
Low
1024x1024
$0.009
1024x1536
$0.013
Image generation
Per image
Quality
Medium
1024x1024
$0.034
1024x1536
$0.05`;
    const options = { upstreamModel: "gpt-image-1.5", category: "image" };
    const result = extractPrices(page, options);
    verifyPositions(page, result);
    assert.equal(result.unit, "image");
    assert.equal(result.variants.length, 4);
    assert.deepEqual(
        result.variants.map((x) => x.input),
        [0.009, 0.013, 0.034, 0.05],
    );
    assert.ok(result.conditions.includes("Quality: Low"));
    assert.ok(result.conditions.includes("Resolution: 1024x1024"));
    assert.equal(
        extractPrices(
            page.replace("# GPT Image 1.5", "# Pricing calculator"),
            options,
        ),
        null,
    );
});

test("speech rate cards preserve character billing and exact versioned registry aliases", () => {
    const page = `### v2 Multilingual
Text to Speech
$0.08
Price per 1K characters
Get started
### Flash / Turbo
Text to Speech
$0.04
Price per 1K characters`;
    const model = {
        name: "elevenlabs/eleven-multilingual-v2",
        aliases: ["multilingual-v2"],
        category: "audio",
    };
    const result = extractPrices(page, { model, upstreamModel: model.name });
    verifyPositions(page, result);
    assert.equal(result.input, 0.08);
    assert.equal(result.unit, "1K_characters");
    assert.equal(
        extractPrices(page.replace("v2 Multilingual", "v3 Multilingual"), {
            model,
            upstreamModel: model.name,
        }),
        null,
    );
});

test("video rate tables preserve audio/resolution and do not mistake the Fast checkpoint for a service tier", () => {
    const page = `## Veo 3.1
 | Free Tier | Paid Tier, per second in USD
Veo 3.1 Fast video with audio price (default) | Not available | $0.10 (720p)
$0.12 (1080p)
$0.30 (4k)
Veo 3.1 Lite video with audio price (default) | Not available | $0.05 (720p)`;
    const options = { upstreamModel: "veo-3.1-fast", category: "video" };
    const result = extractPrices(page, options);
    verifyPositions(page, result);
    assert.equal(result.unit, "second");
    assert.equal(result.variants.length, 3);
    assert.deepEqual(
        result.variants.map((x) => x.input),
        [0.1, 0.12, 0.3],
    );
    assert.ok(result.conditions.some((x) => x.includes("with audio")));
    assert.ok(result.conditions.some((x) => x.includes("720p")));
    assert.equal(
        extractPrices(
            page.replace("per second in USD", "per 1 count"),
            options,
        ),
        null,
    );
});

test("image starting prices retain their resolution formula rather than pretending a flat rate", () => {
    const page = `### FLUX.2: Megapixel-Based Pricing
FLUX.2 pricing scales with output resolution (1024×1024 = 1 megapixel).
| Model | Text-to-Image | Image Editing |
| --- | --- | --- |
| FLUX.2 [klein] 4B | from $0.014 | from $0.014 |
Klein pricing explained: The first megapixel costs a flat rate, then each additional MP adds to the total.
For example, a 2MP image with Klein 4B costs $0.014 + $0.001 = $0.015.
Resolution rounding: Resolution always rounds UP to the next megapixel.`;
    const result = extractPrices(page, {
        upstreamModel: "flux.2-klein-4b",
        category: "image",
    });
    verifyPositions(page, result);
    assert.equal(result.input, 0.014);
    assert.ok(result.conditions.some((x) => x.includes("starting price")));
    assert.ok(result.conditions.some((x) => x.includes("$0.001")));
    assert.ok(result.conditions.some((x) => x.includes("rounds UP")));
});

// Exact excerpts from saved primary Bedrock s37 and Claude s275 pages.
const bedrock = `## Mistral AI
On-Demand pricing
Regions: US East (N. Virginia), US East (Ohio) and US West (Oregon)
| Mistral models | Price per 1M input tokens | Price per 1M output tokens |
| Devstral 2 123B | $ 0.40 | $ 2.00 |
| Mistral Large 3 | $ 0.50 | $ 1.50 |`;
const claude = `## Model pricing
The following table shows pricing for all Claude models:
| Model | Base tokens | Prompt caching |
| Name | Input | Output | 5m writes | 1h writes | Hits and refreshes |
| Claude Opus 5 | $5 / MTok | $25 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok |
| Claude Opus 4.6 | $5 / MTok | $25 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok |`;

test("saved Bedrock table carries token units in headings and retains region scope", () => {
    const options = { upstreamModel: "mistral-large-3", category: "text" };
    const result = extractPrices(bedrock, options);
    assert.equal(result.input, 0.5);
    assert.equal(result.output, 1.5);
    assert.deepEqual(result.conditions, [
        "Regions: US East (N. Virginia), US East (Ohio) and US West (Oregon)",
    ]);
    verifyPositions(bedrock, result);
    for (const source of [
        bedrock.replace("On-Demand pricing", "Priority"),
        bedrock.replace("On-Demand pricing", "Flex"),
        bedrock.replace("On-Demand pricing", "Batch"),
        bedrock.replace("On-Demand pricing", "Prices in CAD"),
        bedrock.replace("1M output tokens", "1K output tokens"),
        bedrock.replace("1M output tokens", "1M output tokens per hour"),
        bedrock.replace("Mistral Large 3 |", "Mistral Large 3.1 |"),
        bedrock.replace("$ 0.50", "0.50"),
        bedrock.replace("On-Demand pricing", "Fine-tuning pricing"),
    ])
        assert.equal(extractPrices(source, options), null);
    assert.equal(extractPrices(bedrock, { ...options, quote: "$ 0.40" }), null);
});

test("saved Claude inline MTok prices exclude caching and preserve exact checkpoint", () => {
    const options = { upstreamModel: "claude-opus-4.6", category: "text" };
    const result = extractPrices(claude, options);
    assert.equal(result.input, 5);
    assert.equal(result.output, 25);
    verifyPositions(claude, result);
    for (const source of [
        claude.replaceAll("/ MTok", "/ 1K tokens"),
        claude.replaceAll("$25 / MTok", "$25"),
        claude.replaceAll(
            "$5 / MTok | $25 / MTok | $6.25",
            "$5 / MTok cached | $25 / MTok | $6.25",
        ),
        claude.replace("## Model pricing", "## Batch pricing"),
        claude.replace("## Model pricing", "## Promotional pricing"),
        claude.replace("## Model pricing", "## Prices in EUR"),
    ])
        assert.equal(extractPrices(source, options), null);
    assert.equal(
        extractPrices(claude, { ...options, quote: "$0.50 / MTok" }),
        null,
    );
});

// Literal rows from the guarded Together primary catalog probe.
const together = `## Chat models
| Organization | Model name | API model string | Context length | Input pricing (per 1M tokens) | Cached input pricing (per 1M tokens) | Output pricing (per 1M tokens) | Quantization | Function calling | Structured outputs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Thinking Machines | Inkling | thinkingmachines/Inkling | 524288 | $1.00 | $0.17 | $4.05 | NVFP4 | Yes | Yes |
| Minimax | Minimax M3 | MiniMaxAI/MiniMax-M3 | 524288 | $0.30 | $0.06 | $1.20 | FP4 | Yes | Yes |
| Moonshot | Kimi K3 | moonshotai/Kimi-K3 | 1048576 | $2.70 | $0.30 | $13.50 | - | Yes | Yes |`;

test("Together API identity column supplies exact rates with quantization condition", () => {
    const options = { upstreamModel: "MiniMaxAI/MiniMax-M3", category: "text" };
    const result = extractPrices(together, options);
    assert.equal(result.input, 0.3);
    assert.equal(result.output, 1.2);
    assert.deepEqual(result.conditions, ["Quantization: FP4"]);
    verifyPositions(together, result);
    assert.ok(
        result.evidence.some(
            (item) =>
                item.kind === "header" && item.quote === "API model string",
        ),
    );
    for (const upstreamModel of [
        "minimax/minimax-m3",
        "MiniMaxAI/MiniMax-M3-fast",
        "MiniMaxAI/MiniMax-M3-2027",
    ])
        assert.equal(
            extractPrices(together, { ...options, upstreamModel }),
            null,
        );
    for (const quote of ["$0.06", "$1.00"])
        assert.equal(extractPrices(together, { ...options, quote }), null);
    for (const source of [
        together.replace(
            "Output pricing (per 1M tokens)",
            "Output pricing (per 1K tokens)",
        ),
        together.replace("API model string", "Description"),
        together.replace("## Chat models", "## Batch pricing"),
        together.replace("## Chat models", "## Prices in CAD"),
        together.replace("$1.20", "Free"),
    ])
        assert.equal(extractPrices(source, options), null);
    const kimi = extractPrices(together, {
        upstreamModel: "moonshotai/kimi-k3",
        category: "text",
    });
    assert.deepEqual(kimi.conditions, []);
    verifyPositions(
        together.replaceAll("\n", "\r\n"),
        extractPrices(together.replaceAll("\n", "\r\n"), options),
    );
});

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

test("categorized embedding rows preserve an explicitly inapplicable output column", () => {
    const source = `Responses API, Chat Completions API, Realtime API, Batch API, and Assistants API are not priced separately.
Specialized models
Prices per 1M tokens.
Standard
### Grouped Pricing Table data
| Category | Model | Input | Cached input | Output |
| --- | --- | --- | --- | --- |
| Search | gpt-5-search-api | $1.25 | $0.125 | $10.00 |
| Embedding | text-embedding-3-small | $0.02 | - | - |
| Embedding | text-embedding-3-large | $0.13 | - | - |`;
    const options = {
        upstreamModel: "openai/text-embedding-3-small",
        category: "embedding",
    };
    const price = extractPrices(source, options);
    assert.equal(price?.input, 0.02);
    assert.equal(price.output, null);
    verifyPositions(source, price);
    for (const invalid of [
        source.replace(
            "Embedding | text-embedding-3-small",
            "Search | text-embedding-3-small",
        ),
        source.replace("$0.02 | - | -", "$0.02 | - | $0.01"),
        source.replace("$0.02 | - | -", "$0.02 | - | unknown"),
        source.replace("Standard", "Batch"),
        `Prices in CAD\n${source}`,
    ])
        assert.equal(extractPrices(invalid, options), null);
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

test("observed xAI video output rate stays partial and does not bind sibling checkpoints", () => {
    const source = `grok-imagine-video-1.5-lite\n## At a glance\nPricing\n$0.02per second\n## Pricing\nOutput\n$0.02per second\nYou are charged for each second of video generated when using the API.\nYou are also charged when using video or image as an input.\nThis model is available on multiple clusters, you can find full regional based pricing below.\n## Details\nModel name\ngrok-imagine-video-1.5-lite`;
    const options = {
        category: "video",
        upstreamModel: "grok-imagine-video-1.5-lite",
        quote: "$0.02per second",
    };
    const result = extractPrices(source, options);
    assert.equal(result.input, 0.02);
    assert.equal(result.output, null);
    assert.equal(result.unit, "second");
    assert.deepEqual(result.conditions, [
        "output component only; full input and regional charges remain unknown",
    ]);
    verifyPositions(source, result);
    for (const altered of [
        source.replace(
            "Model name\ngrok-imagine-video-1.5-lite",
            "Model name\ngrok-imagine-video-1.5",
        ),
        source.replace("## Pricing", "# Prices in CAD\n## Pricing"),
        source.replaceAll("$0.02per second", "$0.02per second per hour"),
        `${source}\nModel name\nother-model`,
        source.replace("Output\n$0.02", "Cached output\n$0.02"),
    ])
        assert.equal(extractPrices(altered, options), null);
    for (const sibling of ["grok-imagine-video-1.5", "grok-imagine-video"])
        assert.equal(
            extractPrices(source, { ...options, upstreamModel: sibling }),
            null,
        );
});
