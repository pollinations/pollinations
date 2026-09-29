/**
 * Scoring statistics for the model evals.
 *
 * A run grades a handful of questions per model, so a bare percentage is not
 * enough to rank two models apart. Every score therefore carries a 95% Wilson
 * interval, and the leaderboard compares scores against the margin of error of
 * their difference.
 */

const Z_95 = 1.959963984540054;

export type Interval = { lower: number; upper: number };

export type Score = {
    correct: number;
    asked: number;
    score: number;
    lower: number;
    upper: number;
    marginOfError: number;
};

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function snapEdge(value: number): number {
    if (value < 1e-9) {
        return 0;
    }
    return value > 1 - 1e-9 ? 1 : value;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * The textbook normal approximation falls apart at the small sample sizes and
 * extreme scores this eval produces (a model answering everything wrong has a
 * zero-width interval), so the ranking uses Wilson, which stays inside [0, 1]
 * and keeps a sensible width when a model misses every question.
 */
export function wilsonInterval(
    correct: number,
    asked: number,
    z = Z_95,
): Interval {
    if (!Number.isFinite(correct) || !Number.isFinite(asked) || asked <= 0) {
        return { lower: 0, upper: 1 };
    }
    const size = Math.max(0, Math.trunc(asked));
    if (size === 0) {
        return { lower: 0, upper: 1 };
    }
    const proportion = clamp01(correct / size);
    const z2 = z * z;
    const centre = (proportion + z2 / (2 * size)) / (1 + z2 / size);
    const halfWidth =
        (z / (1 + z2 / size)) *
        Math.sqrt(
            (proportion * (1 - proportion)) / size + z2 / (4 * size * size),
        );
    // Snap float dust at the edges, so an all-wrong model reports 0 and not 2.8e-17.
    return {
        lower: snapEdge(clamp01(centre - halfWidth)),
        upper: snapEdge(clamp01(centre + halfWidth)),
    };
}

export function scoreFor(correct: number, asked: number, z = Z_95): Score {
    const size = Math.max(0, Math.trunc(asked));
    const hits = Math.min(Math.max(0, Math.trunc(correct)), size);
    const { lower, upper } = wilsonInterval(hits, size, z);
    return {
        correct: hits,
        asked: size,
        score: size > 0 ? hits / size : 0,
        lower,
        upper,
        marginOfError: (upper - lower) / 2,
    };
}

/** Combine per-family scores into one score for the whole eval. */
export function poolScores(scores: readonly Score[], z = Z_95): Score {
    let correct = 0;
    let asked = 0;
    for (const score of scores) {
        correct += score.correct;
        asked += score.asked;
    }
    return scoreFor(correct, asked, z);
}

/** Margin of error of the difference between two independent scores. */
export function differenceMargin(a: Score, b: Score): number {
    return Math.sqrt(a.marginOfError ** 2 + b.marginOfError ** 2);
}
