// The eval runner: scores every selected text model against the same
// randomly generated question set, with per-request seeds (so gen's
// response cache never serves a memorised answer), slow retry on 429 (a
// per-user rate limit is our limit, not a model failure), timeouts and
// errors counted as failures, and Pollen cost accounting from the catalog
// pricing.

import { estimateRequestCost, requestCostPollen } from "./catalog.mjs";
import { isCorrect, parseAnswer } from "./grading.mjs";
import { requestSeed, sleep } from "./rng.mjs";

export const DEFAULT_OPTIONS = {
    baseUrl: "https://gen.pollinations.ai",
    apiKey: null,
    families: ["aiw", "aiw-plus", "bowls"],
    questionsPerFamily: 3,
    concurrency: 3,
    timeoutMs: 120_000,
    retryDelaysMs: [15_000, 30_000, 60_000, 120_000],
    maxCostPollen: 19,
    maxTokens: 2048,
};

async function askModel({
    model,
    question,
    runSeed,
    attempt,
    options,
    fetchFn,
    signal,
}) {
    const seed = requestSeed(runSeed, model.name, question.id, attempt);
    const body = {
        model: model.name,
        messages: [{ role: "user", content: question.prompt }],
        seed,
        max_tokens: options.maxTokens,
        temperature: 1,
    };
    const response = await fetchFn(`${options.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(options.apiKey
                ? { Authorization: `Bearer ${options.apiKey}` }
                : {}),
        },
        body: JSON.stringify(body),
        signal,
    });
    const text = await response.text();
    return { response, text, seed };
}

function extractError(payload, status) {
    if (payload && typeof payload === "object") {
        const error =
            payload.error?.message ?? payload.error ?? payload.message;
        if (error) return String(error).slice(0, 300);
    }
    return `HTTP ${status}`;
}

// Runs one question against one model, retrying 429s slowly. Never skips:
// a question whose retries are exhausted or that times out counts as
// failed for the model.
async function runQuestion({
    model,
    question,
    runSeed,
    options,
    fetchFn,
    log,
}) {
    const delays = [...options.retryDelaysMs, null];
    let attempt = 0;
    for (const delayMs of delays) {
        attempt += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        const startedAt = Date.now();
        let result;
        try {
            result = await askModel({
                model,
                question,
                runSeed,
                attempt,
                options,
                fetchFn,
                signal: controller.signal,
            });
        } catch (error) {
            clearTimeout(timer);
            const aborted =
                error.name === "AbortError" ||
                /aborted|timeout/i.test(error.message ?? "");
            return {
                questionId: question.id,
                family: question.family,
                correct: false,
                error: aborted ? "timeout" : String(error).slice(0, 300),
                attempt,
                latencyMs: Date.now() - startedAt,
                costPollen: null,
            };
        }
        clearTimeout(timer);

        const { response, text, seed } = result;
        const latencyMs = Date.now() - startedAt;

        if (response.status === 429) {
            // A per-user rate limit is our limit, not a model failure:
            // retry slowly instead of counting the question as failed.
            if (delayMs === null) {
                return {
                    questionId: question.id,
                    family: question.family,
                    correct: false,
                    error: "rate_limited",
                    attempt,
                    latencyMs,
                    costPollen: null,
                    seed,
                };
            }
            log?.(`429 from ${model.name}, retrying in ${delayMs / 1000}s`);
            await sleep(delayMs);
            continue;
        }

        let payload = null;
        try {
            payload = JSON.parse(text);
        } catch {
            // handled as an error below
        }
        if (!response.ok) {
            return {
                questionId: question.id,
                family: question.family,
                correct: false,
                error: extractError(payload, response.status),
                attempt,
                latencyMs,
                costPollen: null,
                seed,
            };
        }

        const content = payload?.choices?.[0]?.message?.content;
        const parsed = parseAnswer(
            typeof content === "string" ? content : null,
        );
        return {
            questionId: question.id,
            family: question.family,
            correct: isCorrect(parsed, question.answer),
            parsedAnswer: parsed,
            response: typeof content === "string" ? content : null,
            usage: payload?.usage ?? null,
            expectedAnswer: question.answer,
            error: null,
            attempt,
            latencyMs,
            costPollen: model.costPollenOf(payload?.usage),
            seed,
        };
    }
    // Unreachable: the last delay entry is null and always returns.
    throw new Error("retry loop exhausted");
}

// Scores every selected model against the shared question set. Returns
// per-model entries: status "scored", or "over_cost_cap" for models that
// were not (fully) scored because the run reached the Pollen cost cap.
export async function runEval({
    models,
    questions,
    costPollenOf,
    estimateCostPollenOf = estimateRequestCost,
    runSeed,
    options = {},
    fetchFn = fetch,
    log = () => {},
}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const costPollenOfModel = costPollenOf ?? requestCostPollen;

    const prepared = models.map((model) => ({
        ...model,
        costPollenOf: (usage) => costPollenOfModel(model, usage),
    }));

    const totalCost = { pollen: 0, reserved: 0, uncertain: 0 };
    let unknownCostRequests = 0;
    let rateLimited = false;
    const entries = [];
    let queueIndex = 0;
    let capReached = false;

    async function worker() {
        while (queueIndex < prepared.length) {
            const model = prepared[queueIndex];
            queueIndex += 1;

            if (rateLimited) {
                entries.push({
                    model,
                    status: "rate_limited",
                    questionResults: [],
                });
                continue;
            }

            if (capReached) {
                entries.push({
                    model,
                    status: "over_cost_cap",
                    questionResults: [],
                });
                continue;
            }

            const questionResults = [];
            for (const question of questions) {
                const reservation = estimateCostPollenOf(
                    model,
                    question,
                    opts.maxTokens,
                );
                if (
                    !Number.isFinite(reservation) ||
                    reservation < 0 ||
                    totalCost.pollen +
                        totalCost.uncertain +
                        totalCost.reserved +
                        reservation >
                        opts.maxCostPollen
                ) {
                    capReached = true;
                    log(
                        `Budget reservation cannot fit for ${model.name}; stopping before dispatch`,
                    );
                    break;
                }
                // Reserve synchronously before awaiting: concurrent workers
                // cannot spend the same remaining budget.
                totalCost.reserved += reservation;
                const result = await runQuestion({
                    model,
                    question,
                    runSeed,
                    options: opts,
                    fetchFn,
                    log,
                });
                totalCost.reserved -= reservation;
                if (result.error === "rate_limited") {
                    // Our quota is not a model-quality failure. Do not publish
                    // a comparable score for an incomplete rate-limited run.
                    rateLimited = true;
                } else if (result.costPollen === null) {
                    unknownCostRequests += 1;
                    totalCost.uncertain += reservation;
                } else {
                    totalCost.pollen += result.costPollen;
                    if (
                        totalCost.pollen + totalCost.uncertain >
                        opts.maxCostPollen
                    )
                        capReached = true;
                }
                questionResults.push(result);
                if (rateLimited) break;
            }
            if (questionResults.some((r) => r.error === "rate_limited")) {
                entries.push({
                    model,
                    status: "rate_limited",
                    questionResults,
                });
            } else if (questionResults.length === questions.length) {
                entries.push({ model, status: "scored", questionResults });
                const correct = questionResults.filter((r) => r.correct).length;
                log(
                    `${model.name}: ${correct}/${questionResults.length} correct`,
                );
            } else {
                entries.push({
                    model,
                    status: "over_cost_cap",
                    questionResults,
                });
            }
        }
    }

    const workerCount = Math.max(
        1,
        Math.min(opts.concurrency, prepared.length),
    );
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return {
        totalCostPollen: totalCost.pollen,
        entries,
        capReached,
        rateLimited,
        unknownCostRequests,
        costUpperBoundPollen: totalCost.pollen + totalCost.uncertain,
    };
}
