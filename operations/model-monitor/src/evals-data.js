// Pure helpers for the Evals tab. The scoring/pairing math lives in
// operations/model-evals and is shared with the eval CLI, so the site can
// never disagree with the tool that produced the data.

import {
    leaderboardRows,
    pairCommunityModels,
} from "../../model-evals/stats.mjs";

export const EVALS_LATEST_URL = "evals/latest.json";
export const EVALS_HISTORY_URL = "evals/history.json";

// Validates the latest.json shape; returns null for anything malformed so
// the tab can show a friendly empty state instead of crashing.
export function normalizeEvalRun(data) {
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray(data.models) || data.models.length === 0) return null;
    const models = data.models
        .filter((model) => model.status !== "over_cost_cap")
        .filter(
            (model) =>
                typeof model.name === "string" &&
                typeof model.score === "number" &&
                typeof model.marginOfError === "number",
        )
        .map((model) => ({
            ...model,
            community: model.community === true,
            aliases: Array.isArray(model.aliases) ? model.aliases : [],
        }));
    if (models.length === 0) return null;
    return {
        runId: data.runId ?? null,
        startedAt: data.startedAt ?? null,
        families: Array.isArray(data.families) ? data.families : [],
        questionsPerFamily:
            typeof data.questionsPerFamily === "number"
                ? data.questionsPerFamily
                : null,
        questionCount:
            typeof data.questionCount === "number" ? data.questionCount : null,
        costPollen:
            typeof data.costPollen === "number" ? data.costPollen : null,
        scoredCount: models.length,
        models,
    };
}

// Orders the run's models for the leaderboard: score descending, with each
// community model named after an official model shown directly beneath it
// and its score gap annotated when it exceeds the combined margins of
// error.
export function evalLeaderboard(models) {
    return leaderboardRows(models, pairCommunityModels(models));
}

// Validates history.json; returns the most recent runs first.
export function normalizeEvalHistory(data) {
    if (!Array.isArray(data)) return [];
    return data
        .filter(
            (run) =>
                typeof run.runId === "string" ||
                typeof run.startedAt === "string",
        )
        .map((run) => ({
            runId: run.runId ?? run.startedAt,
            startedAt: run.startedAt ?? null,
            costPollen:
                typeof run.costPollen === "number" ? run.costPollen : null,
            scoredCount:
                typeof run.scoredCount === "number" ? run.scoredCount : null,
            models: Array.isArray(run.models)
                ? run.models.filter(
                      (model) =>
                          typeof model.name === "string" &&
                          typeof model.score === "number",
                  )
                : [],
        }))
        .reverse();
}

// Change of a model's score between its two most recent runs, or null when
// it has fewer than two runs of history.
export function scoreDelta(history, modelName) {
    const scores = history
        .map((run) => run.models.find((model) => model.name === modelName))
        .filter(Boolean)
        .map((model) => model.score);
    if (scores.length < 2) return null;
    return scores[0] - scores[1];
}
