import assert from "node:assert/strict";
import { test } from "node:test";

import {
    differenceMargin,
    poolScores,
    scoreFor,
    wilsonInterval,
} from "./src/stats.mts";

test("wilsonInterval brackets the point estimate and stays inside [0, 1]", () => {
    const { lower, upper } = wilsonInterval(5, 10);
    assert.ok(lower > 0 && lower < 0.5, `lower ${lower}`);
    assert.ok(upper > 0.5 && upper < 1, `upper ${upper}`);
});

test("wilsonInterval keeps a usable width when nothing is correct", () => {
    const { lower, upper } = wilsonInterval(0, 9);
    assert.equal(lower, 0);
    assert.ok(upper > 0 && upper < 0.3, `upper ${upper}`);
});

test("wilsonInterval narrows as the sample grows", () => {
    const small = wilsonInterval(1, 3);
    const large = wilsonInterval(10, 30);
    assert.ok(large.upper - large.lower < small.upper - small.lower);
});

test("scoreFor reports the margin of error as half the interval", () => {
    const score = scoreFor(7, 9);
    assert.equal(score.correct, 7);
    assert.equal(score.asked, 9);
    assert.ok(Math.abs(score.score - 7 / 9) < 1e-12);
    assert.ok(
        Math.abs(score.marginOfError - (score.upper - score.lower) / 2) < 1e-12,
    );
});

test("scoreFor treats a model that was never asked as unscored", () => {
    const score = scoreFor(0, 0);
    assert.equal(score.asked, 0);
    assert.equal(score.score, 0);
    assert.equal(score.marginOfError, 0.5);
});

test("scoreFor clamps a nonsensical correct count", () => {
    const score = scoreFor(12, 9);
    assert.equal(score.correct, 9);
    assert.equal(score.score, 1);
});

test("poolScores merges families into one score", () => {
    const pooled = poolScores([scoreFor(3, 3), scoreFor(0, 3), scoreFor(1, 3)]);
    assert.equal(pooled.correct, 4);
    assert.equal(pooled.asked, 9);
    assert.ok(Math.abs(pooled.score - 4 / 9) < 1e-12);
});

test("differenceMargin grows when either score is noisy", () => {
    const tight = differenceMargin(scoreFor(30, 30), scoreFor(30, 30));
    const loose = differenceMargin(scoreFor(1, 3), scoreFor(1, 3));
    assert.ok(tight < loose);
    assert.ok(tight >= 0);
});
