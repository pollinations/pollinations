// How a community model compares with the official model it is named
// after: one rule for the weekly run's score gaps (run.js, read by
// infra-watch) and the Trust tab on model-monitor, which imports this file.

import { scoreOf } from "./stats.js";

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

// A model's score on the questions it answered. An error says its endpoint
// failed, not how well it answers, so errors never count towards a gap.
const answered = (model) =>
    model.failed > 0
        ? scoreOf(model.correct, model.questions - model.failed)
        : model;

/**
 * Community score against its official twin, both on the questions they
 * answered: `gap` is the community model's score minus its twin's, and it
 * is significant only beyond both 95% Wilson intervals, so neither noise
 * nor errors are flagged, and errors never turn a better model into a
 * worse one. A community model that errored on more than half its
 * questions is a broken endpoint, not a different model.
 */
export function compareToTwin(community, official) {
    const errored = community.failed * 2 > community.questions;
    const [a, b] = [answered(community), answered(official)];
    const gap = a.rate - b.rate;
    const significant = !errored && (a.lower > b.upper || b.lower > a.upper);
    return { gap, significant, errored };
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
        skipped: models.filter((model) => model.status === "skipped"),
        unscored: models.filter((model) => model.status === "unscored"),
    };
}

/**
 * Community models clearly below the official model they are named after,
 * the Trust tab's red rows. The weekly run saves them for infra-watch to
 * show the maintainers; a person confirms before anyone is told.
 */
export const scoreGaps = (models) =>
    buildLeaderboard(models).pairs.filter(
        (pair) => pair.significant && pair.gap < 0,
    );
