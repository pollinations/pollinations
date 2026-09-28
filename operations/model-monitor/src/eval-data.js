// Results are published by .github/workflows/evals-run-weekly.yml to the
// `evals` data branch of the repository; no service sits in between.
export const EVALS_DATA_URL =
    import.meta.env?.VITE_EVALS_DATA_URL ??
    "https://raw.githubusercontent.com/pollinations/pollinations/evals/data";

/**
 * The name a model is known by, without publisher, tag, or release suffix, so
 * `community/vendouple/gpt-6-luna:stable` and `openai/gpt-6-luna` compare equal.
 */
export function baseName(name) {
    return String(name)
        .split("/")
        .pop()
        .toLowerCase()
        .replace(/:.*$/, "")
        .replace(/-(free|stable|preview|latest)$/, "");
}

/** The official model a community model is named after, if any. */
export function officialTwin(model, officialModels) {
    const base = baseName(model.name);
    return (
        officialModels.find((official) => baseName(official.name) === base) ??
        officialModels.find((official) =>
            (official.aliases ?? []).some((alias) => baseName(alias) === base),
        )
    );
}

/**
 * Community score against its official twin. The gap is significant when it
 * exceeds the two margins of error combined, so noise is not flagged.
 */
export function compareToTwin(community, official) {
    const gap = community.rate - official.rate;
    const margin = Math.hypot(community.moe, official.moe);
    return { gap, margin, significant: Math.abs(gap) > margin };
}

/** Scored models best first, plus every community model next to its twin. */
export function buildLeaderboard(models) {
    const scored = models
        .filter((model) => model.status === "scored")
        .sort((a, b) => b.rate - a.rate || a.cost - b.cost);
    const official = scored.filter((model) => !model.community);
    const pairs = scored
        .filter((model) => model.community)
        .flatMap((community) => {
            const twin = officialTwin(community, official);
            return twin
                ? [
                      {
                          community,
                          official: twin,
                          ...compareToTwin(community, twin),
                      },
                  ]
                : [];
        })
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    return {
        ranking: scored,
        pairs,
        skipped: models.filter((model) => model.status !== "scored"),
    };
}
