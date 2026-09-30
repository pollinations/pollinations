import assert from "node:assert/strict";
import { test } from "node:test";

import {
    communityGap,
    leaderboardRows,
    pairCommunityModels,
    scoreModel,
    wilsonInterval,
    wilsonMargin,
} from "./stats.mjs";

test("wilson margin is zero without samples and shrinks with more samples", () => {
    assert.equal(wilsonMargin(0, 0), 0);
    const small = wilsonMargin(5, 10);
    const large = wilsonMargin(50, 100);
    assert.ok(small > large, "more samples means a smaller margin");
    assert.ok(small > 0 && small < 0.5);
});

test("scoreModel counts errors as failures, never skips", () => {
    const summary = scoreModel([
        { correct: true, latencyMs: 100, costPollen: 0.1 },
        { correct: false, error: "timeout", latencyMs: 2000, costPollen: 0 },
        { correct: true, latencyMs: 120, costPollen: 0.1 },
        { correct: false, error: "HTTP 500", latencyMs: 300, costPollen: 0 },
    ]);
    assert.equal(summary.total, 4);
    assert.equal(summary.correct, 2);
    assert.equal(summary.errors, 2);
    assert.equal(summary.score, 0.5);
    assert.ok(summary.marginOfError > 0);
    assert.ok(Math.abs(summary.costPollen - 0.2) < 1e-9);
});

const officialGpt = {
    name: "openai/gpt-6-astra",
    aliases: ["gpt-6-astra"],
    community: false,
};
const officialSol = {
    name: "openai/gpt-6-sol",
    aliases: ["gpt-6-sol"],
    community: false,
};
const communityLuna = {
    name: "community/Saauf/gpt-6-luna",
    aliases: [],
    community: true,
};
const communitySolStable = {
    name: "community/vendouple/gpt-6-sol:stable",
    aliases: [],
    community: true,
};
const communityUnrelated = {
    name: "community/Catniti/muse-glimmer-30b",
    aliases: [],
    community: true,
};

test("community models named after official models are paired", () => {
    const pairs = pairCommunityModels([
        officialGpt,
        officialSol,
        communityLuna,
        communitySolStable,
        communityUnrelated,
    ]);
    // Exact base name (via official alias) beats the looser series match.
    assert.equal(
        pairs.get("community/vendouple/gpt-6-sol:stable"),
        "openai/gpt-6-sol",
    );
    // Series match: shares "gpt-6" with the official model.
    assert.equal(pairs.get("community/Saauf/gpt-6-luna"), "openai/gpt-6-astra");
    // No official namesake: no pair.
    assert.equal(pairs.has("community/Catniti/muse-glimmer-30b"), false);
});

test("a gap larger than the combined margin of error is significant", () => {
    const official = { score: 1, marginOfError: 0.2 };
    const close = { score: 0.9, marginOfError: 0.2 };
    const far = { score: 0.4, marginOfError: 0.2 };
    assert.equal(communityGap(close, official).significant, false);
    const gap = communityGap(far, official);
    assert.equal(gap.significant, true);
    assert.ok(Math.abs(gap.gap - 0.6) < 1e-9);
});

test("leaderboard places community models beneath their official namesake", () => {
    const models = [
        {
            ...officialGpt,
            score: 0.9,
            marginOfError: 0.1,
            total: 9,
            correct: 8,
        },
        {
            ...officialSol,
            score: 0.7,
            marginOfError: 0.1,
            total: 9,
            correct: 6,
        },
        {
            ...communityLuna,
            score: 0.2,
            marginOfError: 0.1,
            total: 9,
            correct: 2,
        },
        {
            ...communitySolStable,
            score: 0.3,
            marginOfError: 0.1,
            total: 9,
            correct: 3,
        },
        {
            ...communityUnrelated,
            score: 0.8,
            marginOfError: 0.1,
            total: 9,
            correct: 7,
        },
    ];
    const pairs = pairCommunityModels(models);
    const rows = leaderboardRows(models, pairs);
    const names = rows.map((row) => row.model.name);
    // Sorted by score, with shadowing community rows under their official.
    assert.deepEqual(names, [
        "openai/gpt-6-astra",
        "community/Saauf/gpt-6-luna",
        "community/Catniti/muse-glimmer-30b",
        "openai/gpt-6-sol",
        "community/vendouple/gpt-6-sol:stable",
    ]);
    const lunaRow = rows.find(
        (row) => row.model.name === "community/Saauf/gpt-6-luna",
    );
    assert.equal(lunaRow.paired.name, "openai/gpt-6-astra");
    assert.equal(lunaRow.gap.significant, true);
    const stableRow = rows.find(
        (row) => row.model.name === "community/vendouple/gpt-6-sol:stable",
    );
    assert.equal(stableRow.paired.name, "openai/gpt-6-sol");
    assert.equal(stableRow.gap.significant, true);
});

test("extreme scores display margins containing the true Wilson bounds", () => {
    for (const correct of [0, 9]) {
        const bounds = wilsonInterval(correct, 9);
        const margin = wilsonMargin(correct, 9);
        const score = correct / 9;
        assert.ok(score - margin <= bounds.lower + 1e-12);
        assert.ok(score + margin >= bounds.upper - 1e-12);
        assert.ok(margin > 0.299 && margin < 0.3);
    }
});
