import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    baseName,
    buildLeaderboard,
    compareToTwin,
    officialTwin,
} from "./eval-data.js";

const model = (name, rate, moe, extra = {}) => ({
    name,
    rate,
    moe,
    cost: 0.01,
    status: "scored",
    community: name.startsWith("community/"),
    aliases: [],
    ...extra,
});

describe("baseName", () => {
    test("drops publisher, tag, and release suffix", () => {
        assert.equal(
            baseName("community/vendouple/gpt-6-luna:stable"),
            "gpt-6-luna",
        );
        assert.equal(baseName("openai/gpt-6-luna"), "gpt-6-luna");
        assert.equal(
            baseName("community/x/gemini-3.1-pro-free"),
            "gemini-3.1-pro",
        );
        assert.equal(
            baseName("google/gemini-3.1-pro-preview"),
            "gemini-3.1-pro",
        );
        assert.equal(baseName("community/M/glm-5.3:paid"), "glm-5.3");
    });
});

describe("officialTwin", () => {
    const official = [
        model("openai/gpt-6-luna", 0.9, 0.1),
        model("moonshotai/kimi-k3", 0.8, 0.1, { aliases: ["kimi"] }),
    ];
    test("matches by name, then by alias, and ignores unrelated models", () => {
        assert.equal(
            officialTwin({ name: "community/a/gpt-6-luna:stable" }, official)
                .name,
            "openai/gpt-6-luna",
        );
        assert.equal(
            officialTwin({ name: "community/a/kimi" }, official).name,
            "moonshotai/kimi-k3",
        );
        assert.equal(
            officialTwin({ name: "community/a/pen" }, official),
            undefined,
        );
    });
});

describe("compareToTwin", () => {
    test("flags a gap only when it beats the combined margin of error", () => {
        const official = model("openai/x", 0.9, 0.1);
        const far = compareToTwin(model("community/a/x", 0.3, 0.15), official);
        assert.ok(far.significant);
        assert.ok(Math.abs(far.gap + 0.6) < 1e-9);
        const near = compareToTwin(model("community/a/x", 0.8, 0.15), official);
        assert.ok(!near.significant);
    });
});

describe("buildLeaderboard", () => {
    test("ranks scored models, pairs community models with their twins, and lists the skipped", () => {
        const { ranking, pairs, skipped } = buildLeaderboard([
            model("openai/gpt-6-luna", 0.93, 0.14),
            model("community/v/gpt-6-luna:stable", 0.27, 0.21),
            model("google/gemma", 0.93, 0.14, { cost: 0.001 }),
            model("community/v/original", 0.5, 0.2),
            { name: "vendor/pricey", status: "skipped", community: false },
        ]);
        assert.deepEqual(
            ranking.map((m) => m.name),
            [
                "google/gemma",
                "openai/gpt-6-luna",
                "community/v/original",
                "community/v/gpt-6-luna:stable",
            ],
        );
        assert.equal(pairs.length, 1);
        assert.equal(pairs[0].official.name, "openai/gpt-6-luna");
        assert.ok(pairs[0].significant);
        assert.deepEqual(
            skipped.map((m) => m.name),
            ["vendor/pricey"],
        );
    });
});
