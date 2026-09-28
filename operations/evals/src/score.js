// Scoring: accuracy with a Wilson margin of error, per model.

/**
 * Wilson score interval (95%) for a binomial proportion. Gives a sensible
 * margin of error even for 0/0 or all-correct samples.
 */
export function wilson(successes, total, z = 1.96) {
    if (total === 0) return { p: 0, low: 0, high: 0, margin: 0 };
    const p = successes / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const half =
        (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) /
        denom;
    return {
        p,
        low: Math.max(0, center - half),
        high: Math.min(1, center + half),
        margin: half,
    };
}

/**
 * Score one model's samples.
 * samples: array of { ok, content, expected, latencyMs, usage, error, kind }
 * A failed or timed-out sample counts as incorrect (not skipped).
 */
export function scoreModel(model, samples) {
    const total = samples.length;
    let correct = 0;
    let failed = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    for (const s of samples) {
        if (!s.ok) failed += 1;
        else if (s.correct) correct += 1;
        if (s.usage) {
            promptTokens += s.usage.prompt_tokens || 0;
            completionTokens += s.usage.completion_tokens || 0;
        }
    }
    const { p, low, high, margin } = wilson(correct, total);
    const failureKinds = {};
    for (const s of samples) {
        if (!s.ok)
            failureKinds[s.kind || "unknown"] =
                (failureKinds[s.kind || "unknown"] || 0) + 1;
    }
    return {
        failureKinds,
        model,
        correct,
        total,
        failed,
        accuracy: p,
        margin,
        low,
        high,
        promptTokens,
        completionTokens,
    };
}

/**
 * Compare each model that shares a base name with an official model (community
 * knock-offs like "gpt-6-luna" vs "openai/gpt-6"). We only highlight a gap
 * bigger than the combined margin of error, so noise isn't flagged.
 */
export function impostorGaps(scores) {
    const official = new Map();
    const community = [];
    for (const s of scores) {
        const base = baseName(s.model);
        if (isCommunity(s.model)) community.push(s);
        else if (!official.has(base)) official.set(base, s);
    }
    const out = [];
    for (const c of community) {
        const o = official.get(baseName(c.model));
        if (!o) continue;
        const gap = o.accuracy - c.accuracy;
        const marginOfGap = o.margin + c.margin;
        out.push({
            community: c.model,
            official: o.model,
            communityAccuracy: c.accuracy,
            officialAccuracy: o.accuracy,
            gap,
            highlighted: Math.abs(gap) > marginOfGap,
        });
    }
    return out;
}

export function isCommunity(model) {
    return model.startsWith("community/");
}

export function baseName(model) {
    return model
        .replace(/^community\/[^/]+\//, "")
        .split("/")
        .pop()
        .toLowerCase()
        .replace(/:.*$/, "");
}
