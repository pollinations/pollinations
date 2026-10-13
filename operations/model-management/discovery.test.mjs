import assert from "node:assert/strict";
import test from "node:test";
import { discoveryCandidates } from "./discovery.mjs";

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
