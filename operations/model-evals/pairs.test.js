import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    baseName,
    buildLeaderboard,
    compareToTwin,
    officialTwin,
    scoreGaps,
} from "./lib/pairs.js";

const model = (name, rate, margin, extra = {}) => ({
    name,
    rate,
    lower: Math.max(0, rate - margin),
    upper: Math.min(1, rate + margin),
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
    test("flags a gap only when the 95% intervals do not overlap", () => {
        const official = model("openai/x", 0.9, 0.1);
        const far = compareToTwin(model("community/a/x", 0.3, 0.15), official);
        assert.ok(far.significant);
        assert.ok(Math.abs(far.gap + 0.6) < 1e-9);
        const near = compareToTwin(model("community/a/x", 0.8, 0.15), official);
        assert.ok(!near.significant);
        // Three right versus three wrong still has overlapping Wilson intervals.
        const tiny = compareToTwin(
            model("community/a/x", 1, 0.562),
            model("openai/x", 0, 0.562),
        );
        assert.ok(!tiny.significant);
    });

    test("never flags a model that errored on most questions: its endpoint is broken", () => {
        const official = model("openai/x", 0.9, 0.1);
        const broken = compareToTwin(
            model("community/a/x", 0.1, 0.1, {
                questions: 30,
                correct: 3,
                failed: 16,
            }),
            official,
        );
        assert.ok(broken.errored);
        assert.ok(!broken.significant);
        const answering = compareToTwin(
            model("community/a/x", 0.1, 0.1, {
                questions: 30,
                correct: 3,
                failed: 15,
            }),
            official,
        );
        assert.ok(!answering.errored);
        assert.ok(answering.significant);
    });
});

describe("errors", () => {
    test("never count towards a gap: only the questions answered compare", () => {
        // 30 asked, 12 errors, all 18 answered right: a flaky endpoint, not
        // a weaker model, though its published score is 60%.
        const official = model("google/x", 1, 0.06, {
            questions: 30,
            correct: 30,
            failed: 0,
        });
        const flaky = compareToTwin(
            model("community/a/x", 0.6, 0.17, {
                questions: 30,
                correct: 18,
                failed: 12,
            }),
            official,
        );
        assert.ok(!flaky.errored);
        assert.ok(!flaky.significant);
        // 4 right out of 28 answered stays a gap.
        const weak = compareToTwin(
            model("community/a/x", 0.13, 0.1, {
                questions: 30,
                correct: 4,
                failed: 2,
            }),
            model("minimax/x", 0.57, 0.17, {
                questions: 30,
                correct: 17,
                failed: 0,
            }),
        );
        assert.ok(weak.significant);
        // Errors never turn a better model into a worse one: 18 of 18
        // answered right with 12 errors publishes 60%, below 20 of 30 (67%),
        // yet on what each answered it is clearly higher (Wilson 82–100%
        // against 49–81%).
        const better = compareToTwin(
            model("community/a/x", 0.6, 0.17, {
                questions: 30,
                correct: 18,
                failed: 12,
            }),
            model("openai/x", 0.67, 0.14, {
                questions: 30,
                correct: 20,
                failed: 0,
            }),
        );
        assert.ok(better.significant);
        assert.ok(better.gap > 0);
        assert.deepEqual(
            scoreGaps([
                model("openai/x", 0.67, 0.14, {
                    questions: 30,
                    correct: 20,
                    failed: 0,
                }),
                model("community/a/x", 0.6, 0.17, {
                    questions: 30,
                    correct: 18,
                    failed: 12,
                }),
            ]),
            [],
        );
    });
});

describe("scoreGaps", () => {
    test("keeps community models clearly below their namesake only", () => {
        const gaps = scoreGaps([
            model("openai/x", 0.9, 0.1),
            model("openai/y", 0.2, 0.1),
            model("community/a/x", 0.2, 0.1),
            model("community/b/y", 0.9, 0.1),
            model("community/c/x:free", 0.2, 0.1, {
                questions: 30,
                failed: 20,
            }),
        ]);
        assert.deepEqual(
            gaps.map((pair) => [pair.community.name, pair.official.name]),
            [["community/a/x", "openai/x"]],
        );
    });
});

describe("buildLeaderboard", () => {
    test("ranks scored models, pairs community models with their twins, and lists the skipped", () => {
        const { ranking, pairs, skipped, unscored } = buildLeaderboard([
            model("openai/gpt-6-luna", 0.93, 0.14),
            model("community/v/gpt-6-luna:stable", 0.27, 0.21),
            model("google/gemma", 0.93, 0.14, { cost: 0.001 }),
            model("community/v/original", 0.5, 0.2),
            { name: "vendor/pricey", status: "skipped", community: false },
            {
                name: "vendor/limited",
                status: "unscored",
                reason: "rate_limited",
            },
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
        assert.deepEqual(
            unscored.map((m) => m.name),
            ["vendor/limited"],
        );
    });
});
