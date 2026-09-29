/**
 * The eval runner: every model answers the same quiz, alone, and every answer is
 * graded by code.
 *
 * Three properties matter more than speed here:
 *
 * 1. Nothing is skipped silently. A model that errors, times out or gets rate
 *    limited keeps its question as a failure and the reason is stored.
 * 2. A run cannot run away with the budget. Models are ordered cheapest-first, a
 *    pre-flight estimate gates each model against the remaining budget, and a
 *    per-model cap stops a single pathological endpoint from eating the week's
 *    Pollen (one community model once burned 0.17 pollen on a single prompt).
 * 3. The cost is measured, not guessed: token usage comes from the response and
 *    is priced with the model's published rate, and the account balance before
 *    and after the run is recorded as ground truth.
 */

import {
    DEFAULT_BASE_URL,
    estimateModelCost,
    estimateTokens,
    type FetchLike,
    hasPricing,
    requestCost,
    type TextModel,
    tokenLimitParameter,
} from "./catalog.mts";
import {
    type ChatOutcome,
    type ChatStatus,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_TIMEOUT_MS,
    fetchAccountBalance,
    requestChat,
} from "./client.mts";
import type { EvalDefinition, EvalQuestion } from "./eval.mts";
import { requestSeed } from "./random.mts";
import { poolScores, type Score, scoreFor } from "./stats.mts";

export const DEFAULT_CONCURRENCY = 6;
export const DEFAULT_QUESTIONS_PER_FAMILY = 3;
export const DEFAULT_BUDGET_POLLEN = 20;
export const DEFAULT_MAX_COST_PER_MODEL = 1;
export const DEFAULT_MAX_TOKENS = 400;
export const MAX_RESPONSE_CHARS = 400;

export type QuestionOutcome = {
    questionId: string;
    family: string;
    variant: string;
    seed: number;
    expectedAnswer: number;
    answer: number | null;
    ok: boolean;
    formatted: boolean;
    status: ChatStatus;
    httpStatus: number | null;
    promptTokens: number;
    completionTokens: number;
    costPollen: number;
    latencyMs: number;
    truncated: boolean;
    reportedModel: string | null;
    effectiveModel: string | null;
    errorMessage: string | null;
    response: string;
};

export type ModelRunStatus = "scored" | "partial" | "not_run";

export type ModelResult = {
    name: string;
    title: string;
    publisher: string;
    community: boolean;
    specialized: boolean;
    health: string;
    score: Score;
    families: Record<string, Score>;
    outcomes: QuestionOutcome[];
    planned: number;
    asked: number;
    notAsked: number;
    failures: number;
    rateLimited: number;
    timeouts: number;
    formatted: number;
    truncated: number;
    costPollen: number;
    costKnown: boolean;
    avgLatencyMs: number;
    status: ModelRunStatus;
    /** Why the model stopped early, when it did. */
    stopReason: string | null;
};

export type RunEvalOptions = {
    evalDefinition: EvalDefinition;
    models: readonly TextModel[];
    apiKey: string;
    baseUrl?: string;
    questionsPerFamily?: number;
    seed?: number;
    concurrency?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    maxTokens?: number;
    /** Total spend ceiling in Pollen. `0` means "no ceiling". */
    pollenBudget?: number;
    /** Spend ceiling per model in Pollen, so one model cannot eat the run. */
    maxCostPerModel?: number;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
    measureBalance?: boolean;
    onModelDone?: (result: ModelResult) => void;
    log?: (message: string) => void;
};

export type RunResult = {
    evalDefinition: EvalDefinition;
    questions: EvalQuestion[];
    models: ModelResult[];
    notRun: { name: string; reason: string }[];
    costPollen: number;
    costUnknownModels: string[];
    balanceBefore: number | null;
    balanceAfter: number | null;
    seed: number;
    questionsPerFamily: number;
    concurrency: number;
    budgetPollen: number;
    maxCostPerModel: number;
    maxTokens: number;
    timeoutMs: number;
    startedAt: string;
    durationSec: number;
};

function truncateResponse(text: string): string {
    if (text.length <= MAX_RESPONSE_CHARS) {
        return text;
    }
    return `${text.slice(0, MAX_RESPONSE_CHARS)}…`;
}

export function outcomeFrom(
    question: EvalQuestion,
    chat: ChatOutcome,
    grade: { ok: boolean; answer: number | null; formatted: boolean },
    options: {
        costPollen: number;
        maxTokens: number;
        capped: boolean;
        seed: number;
    },
): QuestionOutcome {
    const completionTokens = chat.usage?.completion ?? 0;
    const truncated =
        options.capped &&
        (chat.finishReason === "length" ||
            completionTokens >= options.maxTokens);
    return {
        questionId: question.id,
        family: question.family,
        variant: question.variant,
        seed: options.seed,
        expectedAnswer: question.expectedAnswer,
        answer: grade.answer,
        ok: chat.status === "ok" && grade.ok,
        formatted: chat.status === "ok" && grade.formatted,
        status: chat.status,
        httpStatus: chat.httpStatus,
        promptTokens: chat.usage?.prompt ?? 0,
        completionTokens,
        costPollen: options.costPollen,
        latencyMs: chat.latencyMs,
        truncated,
        reportedModel: chat.reportedModel,
        effectiveModel: chat.effectiveModel,
        errorMessage: chat.errorMessage,
        response: truncateResponse(chat.text),
    };
}

function summarizeModel(
    model: TextModel,
    outcomes: QuestionOutcome[],
    planned: number,
    reason: string | null,
): ModelResult {
    const byFamily = new Map<string, QuestionOutcome[]>();
    for (const outcome of outcomes) {
        const bucket = byFamily.get(outcome.family);
        if (bucket) {
            bucket.push(outcome);
        } else {
            byFamily.set(outcome.family, [outcome]);
        }
    }
    const families: Record<string, Score> = {};
    for (const [family, entries] of byFamily) {
        families[family] = scoreFor(
            entries.filter((entry) => entry.ok).length,
            entries.length,
        );
    }
    const asked = outcomes.length;
    const known = hasPricing(model);
    const status: ModelRunStatus =
        asked === 0 ? "not_run" : asked === planned ? "scored" : "partial";
    return {
        name: model.name,
        title: model.title,
        publisher: model.publisher,
        community: model.community,
        specialized: model.specialized,
        health: model.health,
        score: poolScores(
            outcomes.map((outcome) => scoreFor(outcome.ok ? 1 : 0, 1)),
        ),
        families,
        outcomes,
        planned,
        asked,
        notAsked: planned - asked,
        failures: outcomes.filter((outcome) => outcome.status === "error")
            .length,
        rateLimited: outcomes.filter(
            (outcome) => outcome.status === "rate_limited",
        ).length,
        timeouts: outcomes.filter((outcome) => outcome.status === "timeout")
            .length,
        formatted: outcomes.filter((outcome) => outcome.formatted).length,
        truncated: outcomes.filter((outcome) => outcome.truncated).length,
        costPollen: outcomes.reduce(
            (sum, outcome) => sum + outcome.costPollen,
            0,
        ),
        costKnown: known,
        avgLatencyMs:
            asked > 0
                ? outcomes.reduce(
                      (sum, outcome) => sum + outcome.latencyMs,
                      0,
                  ) / asked
                : 0,
        status,
        stopReason: reason,
    };
}

export async function runEval(options: RunEvalOptions): Promise<RunResult> {
    const now = options.now ?? Date.now;
    const log = options.log ?? (() => {});
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const questionsPerFamily =
        options.questionsPerFamily ?? DEFAULT_QUESTIONS_PER_FAMILY;
    const seed = options.seed ?? now();
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const budgetPollen = options.pollenBudget ?? DEFAULT_BUDGET_POLLEN;
    const maxCostPerModel =
        options.maxCostPerModel ?? DEFAULT_MAX_COST_PER_MODEL;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

    const evalDefinition = options.evalDefinition;
    const questions = evalDefinition.questions({
        seed,
        perFamily: questionsPerFamily,
    });
    const promptTokens = questions.reduce(
        (max, question) => Math.max(max, estimateTokens(question.prompt)),
        0,
    );

    log(
        `Eval ${evalDefinition.id}: ${questions.length} questions (${evalDefinition.families.join(", ")}) seed ${seed}`,
    );
    log(
        `Models: ${options.models.length} · concurrency ${concurrency} · budget ${budgetPollen} pollen`,
    );

    const startedAtMs = now();
    const balanceBefore =
        options.measureBalance === false
            ? null
            : await fetchAccountBalance({
                  apiKey: options.apiKey,
                  baseUrl,
                  fetchImpl: options.fetchImpl,
              });
    if (balanceBefore !== null) {
        log(
            `Account balance before the run: ${balanceBefore.toFixed(6)} pollen`,
        );
    }

    // Cheapest first: if the budget runs out, the models that still fit get scored.
    const ordered = [...options.models].sort((a, b) => {
        const costA = estimateModelCost(a, {
            promptTokens,
            maxOutputTokens: maxTokens,
            questions: questions.length,
        });
        const costB = estimateModelCost(b, {
            promptTokens,
            maxOutputTokens: maxTokens,
            questions: questions.length,
        });
        return costA === costB ? a.name.localeCompare(b.name) : costA - costB;
    });

    const results: ModelResult[] = [];
    const notRun: { name: string; reason: string }[] = [];
    let spent = 0;
    let cursor = 0;

    const runOne = async (model: TextModel): Promise<ModelResult> => {
        const outcomes: QuestionOutcome[] = [];
        let modelCost = 0;
        let stopReason: string | null = null;
        const limitParameter = tokenLimitParameter(model);
        for (const question of questions) {
            if (modelCost >= maxCostPerModel) {
                stopReason = `cost cap of ${maxCostPerModel} pollen reached after ${outcomes.length} of ${questions.length} questions`;
                break;
            }
            const chat = await requestChat({
                apiKey: options.apiKey,
                baseUrl,
                model: model.name,
                prompt: question.prompt,
                seed: requestSeed(seed, model.name, question.id),
                maxTokens: limitParameter ? maxTokens : null,
                tokenLimitParameter: limitParameter,
                timeoutMs,
                maxAttempts,
                fetchImpl: options.fetchImpl,
                sleep: options.sleep,
                random: options.random,
                now: options.now,
            });
            const grade = evalDefinition.grade(question, chat.text);
            const cost = chat.usage ? requestCost(model, chat.usage) : 0;
            modelCost += cost;
            spent += cost;
            outcomes.push(
                outcomeFrom(question, chat, grade, {
                    costPollen: cost,
                    maxTokens,
                    capped: limitParameter !== null,
                    seed: requestSeed(seed, model.name, question.id),
                }),
            );
        }
        return summarizeModel(model, outcomes, questions.length, stopReason);
    };

    const workers = Array.from(
        { length: Math.min(concurrency, ordered.length) },
        async () => {
            while (cursor < ordered.length) {
                const model = ordered[cursor];
                cursor += 1;
                const worstCase = estimateModelCost(model, {
                    promptTokens,
                    maxOutputTokens: maxTokens,
                    questions: questions.length,
                });
                if (
                    budgetPollen > 0 &&
                    spent > 0 &&
                    spent + worstCase > budgetPollen
                ) {
                    notRun.push({
                        name: model.name,
                        reason: `would exceed the ${budgetPollen} pollen budget`,
                    });
                    continue;
                }
                const result = await runOne(model);
                results.push(result);
                options.onModelDone?.(result);
            }
        },
    );
    await Promise.all(workers);

    const durationSec = (now() - startedAtMs) / 1000;
    const costPollen = results.reduce(
        (sum, result) => sum + result.costPollen,
        0,
    );
    const balanceAfter =
        options.measureBalance === false
            ? null
            : await fetchAccountBalance({
                  apiKey: options.apiKey,
                  baseUrl,
                  fetchImpl: options.fetchImpl,
              });

    return {
        evalDefinition,
        questions,
        models: results,
        notRun,
        costPollen,
        costUnknownModels: results
            .filter((result) => !result.costKnown)
            .map((result) => result.name),
        balanceBefore,
        balanceAfter,
        seed,
        questionsPerFamily,
        concurrency,
        budgetPollen,
        maxCostPerModel,
        maxTokens,
        timeoutMs,
        startedAt: new Date(startedAtMs).toISOString(),
        durationSec,
    };
}
