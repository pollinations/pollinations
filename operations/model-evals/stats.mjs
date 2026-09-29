// Scoring statistics for eval runs.

// Wilson score interval (95%) half-width for a binomial proportion. Every
// model score carries this margin of error; a community model only differs
// meaningfully from an official model when the score gap exceeds the
// combined margins.
export function wilsonMargin(successes, total) {
    if (!total || total <= 0) return 0;
    const z = 1.96;
    const n = total;
    const p = successes / n;
    const denominator = 1 + (z * z) / n;
    const spread =
        (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
        denominator;
    return spread;
}

// Summarises one model's question results into a score with its margin of
// error. Errors and timeouts count as failures, never as skips.
export function scoreModel(questionResults) {
    const total = questionResults.length;
    const correct = questionResults.filter((result) => result.correct).length;
    const errors = questionResults.filter((result) => result.error).length;
    const score = total > 0 ? correct / total : 0;
    const costPollen = questionResults.reduce(
        (sum, result) => sum + (result.costPollen ?? 0),
        0,
    );
    const latencies = questionResults
        .filter((result) => result.latencyMs != null)
        .map((result) => result.latencyMs);
    const avgLatencyMs =
        latencies.length > 0
            ? latencies.reduce((sum, value) => sum + value, 0) /
              latencies.length
            : null;
    return {
        total,
        correct,
        errors,
        score,
        marginOfError: wilsonMargin(correct, total),
        costPollen,
        avgLatencyMs,
    };
}

function tokensOf(name) {
    return name.split(/[-_.]/).filter(Boolean);
}

// Leading tokens shared by two model short names: "gpt-6-luna" vs
// "gpt-6-astra" share "gpt","6" (2 tokens), enough to treat the community
// model as named after the official one.
function leadingCommonTokens(a, b) {
    const tokensA = tokensOf(a);
    const tokensB = tokensOf(b);
    let shared = 0;
    while (
        shared < tokensA.length &&
        shared < tokensB.length &&
        tokensA[shared].toLowerCase() === tokensB[shared].toLowerCase()
    ) {
        shared += 1;
    }
    return shared;
}

function baseNameOf(name) {
    return name.split("/").pop().split(":")[0].toLowerCase();
}

const MIN_SHARED_TOKENS = 2;

// Pairs community models with the official model they are named after.
// Returns a map of community model name -> official model name. An exact
// base-name match ("gpt-6-sol:stable" vs "gpt-6-sol", including official
// aliases) beats a looser series match ("gpt-6-luna" vs "gpt-6-astra").
export function pairCommunityModels(models) {
    const officials = models.filter((model) => model.community !== true);
    const communities = models.filter((model) => model.community === true);
    const pairs = new Map();

    for (const community of communities) {
        let bestMatch = null;
        for (const official of officials) {
            const exact =
                baseNameOf(community.name) === baseNameOf(official.name) ||
                (official.aliases ?? []).some(
                    (alias) => baseNameOf(community.name) === baseNameOf(alias),
                );
            if (exact) {
                bestMatch = official.name;
                break;
            }
        }
        if (bestMatch) {
            pairs.set(community.name, bestMatch);
            continue;
        }
        let bestShared = MIN_SHARED_TOKENS - 1;
        for (const official of officials) {
            const shared = leadingCommonTokens(
                community.name.split("/").pop(),
                official.name.split("/").pop(),
            );
            if (shared > bestShared) {
                bestShared = shared;
                bestMatch = official.name;
            }
        }
        if (bestMatch) pairs.set(community.name, bestMatch);
    }
    return pairs;
}

// The score gap between a community model and the official model it is
// named after, and whether the gap exceeds the combined margins of error.
export function communityGap(communityScored, officialScored) {
    const gap = officialScored.score - communityScored.score;
    const combinedMargin =
        officialScored.marginOfError + communityScored.marginOfError;
    return {
        gap,
        combinedMargin,
        significant: Math.abs(gap) > combinedMargin,
    };
}

// Orders a run's model rows for the leaderboard: by score descending, with
// every community model that shadows an official model placed directly
// beneath that official model.
export function leaderboardRows(models, pairs) {
    const standings = [...models].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );
    const byName = new Map(models.map((model) => [model.name, model]));
    const rows = [];
    const emitted = new Set();
    for (const model of standings) {
        if (model.community === true && pairs.has(model.name)) continue;
        rows.push({ model, paired: null, gap: null });
        emitted.add(model.name);
        // Community models named after this official model rank directly
        // beneath it, whatever their own score, in pairing order.
        for (const [communityName, officialName] of pairs) {
            if (officialName !== model.name || emitted.has(communityName)) {
                continue;
            }
            const community = byName.get(communityName);
            if (!community) continue;
            emitted.add(communityName);
            rows.push({
                model: community,
                paired: model,
                gap: communityGap(community, model),
            });
        }
    }
    return rows;
}
