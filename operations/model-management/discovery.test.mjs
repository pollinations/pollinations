import assert from "node:assert/strict";
import test from "node:test";
import { discoveryCandidates } from "./discovery.mjs";

test("literal primary provider brands precede a crowded model table without inventing an origin's brand", () => {
    const result = discoveryCandidates(
        [
            {
                id: "provider",
                status: "fetched",
                url: "https://inferhub.dev/pricing",
                text:
                    "Pricing & models · InferHub\nInferHub offers managed inference.\n" +
                    Array.from({ length: 20 }, (_, i) => `Lab/Model-${i}`).join(
                        " ",
                    ),
            },
            {
                id: "absent",
                status: "fetched",
                url: "https://unknown.example/pricing",
                text: "Lab/Model-50",
            },
            {
                id: "platform",
                status: "fetched",
                url: "https://huggingface.co/blog/release",
                text: "HuggingFace blog.\nLab/Model-51",
            },
        ],
        [],
    );
    assert.equal(result.candidates[0].name, "InferHub");
    assert.ok(
        !result.candidates.some(
            ({ name }) => name === "unknown" || name === "HuggingFace",
        ),
    );
    assert.ok(
        result.candidates[0].quote.includes(
            "InferHub offers managed inference",
        ),
    );
});

test("navigation titles and provider counters are not entity names", () => {
    const text =
        "LiquidAI/LFM2.5-24B-A2B is a model.\nGet Started with LFM2.5-24B-A2B\nag/99 active providers\nLab/123 is a checkpoint.\nNicheServe offers managed inference.";
    const result = discoveryCandidates(
        [
            {
                id: "s1",
                status: "fetched",
                url: "https://provider.example/pricing",
                text,
                links: [{ text: "Get Started with LFM2.5-24B-A2B" }],
            },
        ],
        [],
    );
    assert.deepEqual(
        result.candidates.map(({ name }) => name).sort(),
        ["LiquidAI/LFM2.5-24B-A2B", "Lab/123", "NicheServe"].sort(),
    );
});

test("literal discovery retains provider labels, plain headings and checkpoints with exact spans", () => {
    const text =
        "New community favorite: startup/novel-4 released this month.\n# Model Card for PlainModel 4\nPlainModel 4 is a newly released checkpoint.\nNicheServe offers hosted inference for this model.";
    const source = {
        id: "s1",
        status: "fetched",
        url: "https://huggingface.co/startup/novel-4",
        text,
        links: [
            { url: "https://nicheserve.example/models", text: "NicheServe" },
        ],
    };
    const result = discoveryCandidates([source], []);
    assert.deepEqual(
        result.candidates.map(({ name }) => name).sort(),
        ["startup/novel-4", "PlainModel 4", "NicheServe"].sort(),
    );
    for (const candidate of result.candidates) {
        assert.equal(
            text.slice(candidate.start, candidate.end),
            candidate.quote,
        );
        assert.ok(candidate.quote.includes(candidate.name));
        assert.equal(candidate.sourceId, source.id);
    }
});

test("discovery excludes official checkpoints and unavailable pages while leaving plain aliases for kind classification", () => {
    const source = {
        id: "s1",
        status: "fetched",
        url: "https://docs.example/models",
        text: "Known/checkpoint-4 is official. checkpoint-4 and alias-4 exist.\n# Model alias-4",
        links: [{ url: "https://provider.example", text: "Invented" }],
    };
    const result = discoveryCandidates(
        [
            source,
            {
                ...source,
                id: "unavailable",
                status: "unavailable",
                text: "new/model-5",
            },
        ],
        [{ name: "known/checkpoint-4", aliases: ["alias-4"] }],
    );
    assert.deepEqual(
        result.candidates.map(({ name }) => name),
        ["alias-4"],
    );
});

test("ordinary release prose and providers sharing model aliases reach typed extraction", () => {
    const source = {
        id: "s1",
        status: "fetched",
        url: "https://docs.example/releases",
        text: "Today we released NovelModel 4, our new trending model. Nova offers hosted inference for it.",
        links: [],
    };
    const result = discoveryCandidates(
        [source],
        [{ name: "amazon/nova", aliases: ["nova"] }],
    );
    assert.deepEqual(
        result.candidates.map(({ name }) => name),
        ["NovelModel 4", "Nova"],
    );
});

test("discovery ignores domain paths, throughput units and article titles while keeping literal names", () => {
    const text =
        "45tok/sec https://github.com/niko1221 and openrouter.ai/models. meta.ai/v1.\n# Prime Inference: Fast reliable inference\nPrime Inference offers hosted inference.\n# Meta Ships A New Model With A Long Article Title\nLiquidAI/LFM2.5-Encoder-350M is a model repository.";
    const { candidates } = discoveryCandidates(
        [
            {
                id: "s1",
                url: "https://publisher.example/release",
                status: "fetched",
                text,
            },
        ],
        [],
    );
    assert.deepEqual(
        candidates.map(({ name }) => name).sort(),
        ["Prime Inference", "LiquidAI/LFM2.5-Encoder-350M"].sort(),
    );
    for (const candidate of candidates)
        assert.equal(
            text.slice(candidate.start, candidate.end),
            candidate.quote,
        );
});

test("literal extraction exposes truncation and preserves multiple source origins", () => {
    const sources = Array.from({ length: 20 }, (_, i) => ({
        id: `s${i}`,
        status: "fetched",
        url: `https://provider-${i}.example`,
        text: Array.from(
            { length: 10 },
            (_, j) => `owner${i}/checkpoint-${j} released a new model`,
        ).join("\n"),
    }));
    const result = discoveryCandidates(sources, []);
    assert.equal(result.candidates.length, 96);
    assert.ok(result.omitted > 0);
    assert.ok(result.candidates.every(({ quote }) => quote.length <= 800));
    assert.equal(
        new Set(result.candidates.map(({ sourceId }) => sourceId)).size,
        16,
    );
});

test("numeric publisher namespaces in public Hub metadata remain research leads", () => {
    const text = JSON.stringify([
        { id: "01-ai/Yi-1.5-34B-Chat", downloads: 123 },
        { id: "1bitLLM/bitnet_b1_58-large", downloads: 456 },
    ]);
    const result = discoveryCandidates(
        [
            {
                id: "hub",
                status: "fetched",
                url: "https://huggingface.co/api/models",
                text,
            },
        ],
        [],
    );
    assert.deepEqual(
        result.candidates.map(({ name }) => name),
        ["01-ai/Yi-1.5-34B-Chat", "1bitLLM/bitnet_b1_58-large"],
    );
});

test("a different upstream namespace cannot rediscover an official checkpoint", () => {
    const text =
        "deepseek-ai/DeepSeek-V4.1-Flash-1017 models/gemini-4-argon deepseek-ai/DeepSeek-V4.1-Flash-1017-GGUF";
    const result = discoveryCandidates(
        [
            {
                id: "hub",
                status: "fetched",
                url: "https://huggingface.co/models",
                text,
            },
        ],
        [
            { name: "deepseek/deepseek-v4.1-flash-1017" },
            { name: "google/gemini-4-argon" },
        ],
    );
    assert.deepEqual(
        result.candidates.map((x) => x.name),
        ["deepseek-ai/DeepSeek-V4.1-Flash-1017-GGUF"],
    );
});
