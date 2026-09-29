/**
 * Report building and rendering.
 *
 * `latest.json` is what the model-monitor website reads; `history.json` keeps the
 * last year of weekly runs so the leaderboard can show movement over time. Both
 * are plain JSON with a schema version, published to the `news` branch.
 */

import { pairCommunityWithOfficial, type TextModel } from "./catalog.mts";
import type { ModelResult, RunResult } from "./runner.mts";
import { differenceMargin, type Score } from "./stats.mts";

export const REPORT_SCHEMA = 1;
export const HISTORY_LIMIT = 52;

export type RankingRow = {
    rank: number;
    name: string;
    title: string;
    scope: "official" | "community";
    specialized: boolean;
    publisher: string;
    health: string;
    status: ModelResult["status"];
    score: number;
    correct: number;
    asked: number;
    planned: number;
    marginOfError: number;
    interval: [number, number];
    families: Record<
        string,
        { score: number; correct: number; asked: number; marginOfError: number }
    >;
    costPollen: number;
    costKnown: boolean;
    avgLatencyMs: number;
    failures: number;
    rateLimited: number;
    timeouts: number;
    formatted: number;
    truncated: number;
};

export type PairRow = {
    community: string;
    official: string;
    match: "exact" | "prefix";
    communityScore: number;
    communityAsked: number;
    communityMargin: number;
    officialScore: number;
    officialAsked: number;
    officialMargin: number;
    gap: number;
    marginOfError: number;
    exceedsMargin: boolean;
};

export type ReportRun = {
    id: string;
    evalId: string;
    evalTitle: string;
    startedAt: string;
    generatedAt: string;
    durationSec: number;
    seed: number;
    questionsPerFamily: number;
    questionsPerModel: number;
    questionsTotal: number;
    modelCount: number;
    scoredModels: number;
    askedQuestions: number;
    costPollen: number;
    budgetPollen: number;
    maxCostPerModel: number;
    maxTokens: number;
    concurrency: number;
    timeoutMs: number;
    balanceBefore: number | null;
    balanceAfter: number | null;
    baseUrl: string;
};

export type RunReport = {
    schema: number;
    eval: {
        id: string;
        title: string;
        description: string;
        version: number;
        source: string;
        families: string[];
    };
    run: ReportRun;
    ranking: RankingRow[];
    notRun: { name: string; reason: string }[];
    pairs: PairRow[];
    costUnknownModels: string[];
};

export type HistoryEntry = {
    id: string;
    evalId: string;
    startedAt: string;
    generatedAt: string;
    costPollen: number;
    scoredModels: number;
    askedQuestions: number;
    ranking: {
        name: string;
        scope: "official" | "community";
        score: number;
        correct: number;
        asked: number;
        marginOfError: number;
    }[];
};

export type HistoryFile = {
    schema: number;
    updatedAt: string;
    runs: HistoryEntry[];
};

function round(value: number, digits = 4): number {
    return Number(value.toFixed(digits));
}

function roundingScore(score: Score): {
    score: number;
    correct: number;
    asked: number;
    marginOfError: number;
} {
    return {
        score: round(score.score),
        correct: score.correct,
        asked: score.asked,
        marginOfError: round(score.marginOfError),
    };
}

function toRankingRow(result: ModelResult): RankingRow {
    const families: RankingRow["families"] = {};
    for (const [family, score] of Object.entries(result.families)) {
        families[family] = {
            ...roundingScore(score),
            asked: score.asked,
            correct: score.correct,
        };
    }
    return {
        rank: 0,
        name: result.name,
        title: result.title,
        scope: result.community ? "community" : "official",
        specialized: result.specialized,
        publisher: result.publisher,
        health: result.health,
        status: result.status,
        score: round(result.score.score),
        correct: result.score.correct,
        asked: result.score.asked,
        planned: result.planned,
        marginOfError: round(result.score.marginOfError),
        interval: [round(result.score.lower), round(result.score.upper)],
        families,
        costPollen: Number(result.costPollen.toFixed(6)),
        costKnown: result.costKnown,
        avgLatencyMs: Math.round(result.avgLatencyMs),
        failures: result.failures,
        rateLimited: result.rateLimited,
        timeouts: result.timeouts,
        formatted: result.formatted,
        truncated: result.truncated,
    };
}

/** Ties share a rank; a lower margin of error breaks the display order only. */
function assignRanks(rows: RankingRow[]): RankingRow[] {
    const sorted = [...rows].sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        if (a.marginOfError !== b.marginOfError) {
            return a.marginOfError - b.marginOfError;
        }
        return a.name.localeCompare(b.name);
    });
    let rank = 0;
    let previousScore: number | null = null;
    for (let index = 0; index < sorted.length; index++) {
        const row = sorted[index];
        if (previousScore === null || row.score !== previousScore) {
            rank = index + 1;
            previousScore = row.score;
        }
        row.rank = rank;
    }
    return sorted;
}

export function buildPairs(results: readonly ModelResult[]): PairRow[] {
    const scored = results.filter((result) => result.asked > 0);
    const asModels: TextModel[] = scored.map((result) => ({
        name: result.name,
        aliases: [],
        title: result.title,
        publisher: result.publisher,
        community: result.community,
        specialized: result.specialized,
        health: result.health,
        pricing: {
            promptTextTokens: 0,
            completionTextTokens: 0,
            promptCachedTokens: 0,
        },
        supportedParameters: [],
    }));
    const byName = new Map(scored.map((result) => [result.name, result]));
    const pairs: PairRow[] = [];
    for (const pair of pairCommunityWithOfficial(asModels)) {
        const community = byName.get(pair.community);
        const official = byName.get(pair.official);
        if (!community || !official) {
            continue;
        }
        const gap = community.score.score - official.score.score;
        const margin = differenceMargin(community.score, official.score);
        pairs.push({
            community: community.name,
            official: official.name,
            match: pair.match,
            communityScore: round(community.score.score),
            communityAsked: community.score.asked,
            communityMargin: round(community.score.marginOfError),
            officialScore: round(official.score.score),
            officialAsked: official.score.asked,
            officialMargin: round(official.score.marginOfError),
            gap: round(gap),
            marginOfError: round(margin),
            exceedsMargin: Math.abs(gap) > margin,
        });
    }
    return pairs.sort(
        (a, b) =>
            Math.abs(b.gap) - Math.abs(a.gap) ||
            a.community.localeCompare(b.community),
    );
}

export function buildReport(
    result: RunResult,
    options: { generatedAt?: string; baseUrl?: string } = {},
): RunReport {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const ranking = assignRanks(
        result.models.filter((model) => model.asked > 0).map(toRankingRow),
    );
    return {
        schema: REPORT_SCHEMA,
        eval: {
            id: result.evalDefinition.id,
            title: result.evalDefinition.title,
            description: result.evalDefinition.description,
            version: result.evalDefinition.version,
            source: result.evalDefinition.source,
            families: [...result.evalDefinition.families],
        },
        run: {
            id: result.startedAt,
            evalId: result.evalDefinition.id,
            evalTitle: result.evalDefinition.title,
            startedAt: result.startedAt,
            generatedAt,
            durationSec: round(result.durationSec, 1),
            seed: result.seed,
            questionsPerFamily: result.questionsPerFamily,
            questionsPerModel: result.questions.length,
            questionsTotal: result.questions.length * result.models.length,
            modelCount: result.models.length,
            scoredModels: ranking.length,
            askedQuestions: result.models.reduce(
                (sum, model) => sum + model.asked,
                0,
            ),
            costPollen: Number(result.costPollen.toFixed(6)),
            budgetPollen: result.budgetPollen,
            maxCostPerModel: result.maxCostPerModel,
            maxTokens: result.maxTokens,
            concurrency: result.concurrency,
            timeoutMs: result.timeoutMs,
            balanceBefore: result.balanceBefore,
            balanceAfter: result.balanceAfter,
            baseUrl: options.baseUrl ?? "",
        },
        ranking,
        notRun: result.notRun,
        pairs: buildPairs(result.models),
        costUnknownModels: result.costUnknownModels,
    };
}

export function buildHistoryEntry(report: RunReport): HistoryEntry {
    return {
        id: report.run.id,
        evalId: report.eval.id,
        startedAt: report.run.startedAt,
        generatedAt: report.run.generatedAt,
        costPollen: report.run.costPollen,
        scoredModels: report.run.scoredModels,
        askedQuestions: report.run.askedQuestions,
        ranking: report.ranking.map((row) => ({
            name: row.name,
            scope: row.scope,
            score: row.score,
            correct: row.correct,
            asked: row.asked,
            marginOfError: row.marginOfError,
        })),
    };
}

export function appendHistory(
    history: HistoryFile | null,
    entry: HistoryEntry,
    options: { limit?: number; updatedAt?: string } = {},
): HistoryFile {
    const limit = options.limit ?? HISTORY_LIMIT;
    const runs = [
        entry,
        ...(history?.runs ?? []).filter((existing) => existing.id !== entry.id),
    ];
    return {
        schema: REPORT_SCHEMA,
        updatedAt: options.updatedAt ?? entry.generatedAt,
        runs: runs.slice(0, limit),
    };
}

export function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

export function formatPollen(value: number): string {
    return value.toFixed(6);
}

function pad(text: string, width: number): string {
    return text.length >= width ? text : text.padEnd(width);
}

function padStart(text: string, width: number): string {
    return text.length >= width ? text : text.padStart(width);
}

export function renderLeaderboard(report: RunReport): string {
    const lines: string[] = [];
    lines.push(`# Model evals — ${report.eval.title} (${report.eval.id})`);
    lines.push("");
    lines.push(
        `rank  ${pad("model", 44)}${padStart("score", 7)}${padStart("±", 8)}${padStart("ok/n", 8)}${padStart("cost", 12)}${padStart("fail", 6)}${padStart("avg", 8)}`,
    );
    for (const row of report.ranking) {
        const flag = row.status === "partial" ? "~" : " ";
        const cost = row.costKnown ? formatPollen(row.costPollen) : "n/a";
        lines.push(
            `${padStart(String(row.rank), 4)}${flag} ${pad(row.name, 44)}${padStart(formatPercent(row.score), 7)}${padStart(`±${formatPercent(row.marginOfError)}`, 8)}${padStart(`${row.correct}/${row.asked}`, 8)}${padStart(cost, 12)}${padStart(String(row.failures + row.rateLimited + row.timeouts), 6)}${padStart(`${(row.avgLatencyMs / 1000).toFixed(1)}s`, 8)}`,
        );
    }
    if (report.ranking.length === 0) {
        lines.push("  (no model was scored)");
    }
    if (report.pairs.length > 0) {
        lines.push("");
        lines.push("Community models named after an official model:");
        for (const pair of report.pairs) {
            const mark = pair.exceedsMargin ? "!" : " ";
            lines.push(
                `${mark} ${pad(pair.community, 44)}${padStart(formatPercent(pair.communityScore), 7)} vs ${pad(pair.official, 40)}${padStart(formatPercent(pair.officialScore), 7)}  gap ${formatPercent(pair.gap)} ± ${formatPercent(pair.marginOfError)}`,
            );
        }
    }
    if (report.notRun.length > 0) {
        lines.push("");
        lines.push(`Not run (${report.notRun.length}):`);
        for (const skipped of report.notRun) {
            lines.push(`  - ${skipped.name}: ${skipped.reason}`);
        }
    }
    lines.push("");
    const delta =
        report.run.balanceBefore !== null && report.run.balanceAfter !== null
            ? ` · balance ${formatPollen(report.run.balanceBefore)} → ${formatPollen(report.run.balanceAfter)} pollen`
            : "";
    lines.push(
        `${report.run.scoredModels}/${report.run.modelCount} models · ${report.run.askedQuestions}/${report.run.questionsTotal} questions answered · ${formatPollen(report.run.costPollen)} pollen of a ${report.run.budgetPollen} pollen budget · ${report.run.durationSec.toFixed(1)}s · seed ${report.run.seed}${delta}`,
    );
    if (report.costUnknownModels.length > 0) {
        lines.push(
            `Cost unknown (no published price): ${report.costUnknownModels.join(", ")}`,
        );
    }
    return lines.join("\n");
}
