// The eval runner: scores every selected text model against the same
// randomly generated question set, with per-request seeds (so gen's
// response cache never serves a memorised answer), slow retry on 429 (a
// per-user rate limit is our limit, not a model failure), timeouts and
// errors counted as failures, and Pollen cost accounting from the catalog
// pricing.

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
    maxCostPollen: 20,
    maxTokens: 4000,
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
                costPollen: 0,
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
                    costPollen: 0,
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
                costPollen: 0,
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
            expectedAnswer: question.answer,
            error: null,
            attempt,
            latencyMs,
            costPollen: model.costPollenOf?.(payload?.usage) ?? 0,
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
    runSeed,
    options = {},
    fetchFn = fetch,
    log = () => {},
}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const costPollenOfModel = costPollenOf ?? (() => 0);

    const prepared = models.map((model) => ({
        ...model,
        costPollenOf: (usage) => costPollenOfModel(model, usage),
    }));

    const totalCost = { pollen: 0 };
    const entries = [];
    let queueIndex = 0;
    let capReached = false;

    async function worker() {
        while (queueIndex < prepared.length) {
            const model = prepared[queueIndex];
            queueIndex += 1;

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
                if (totalCost.pollen >= opts.maxCostPollen) {
                    capReached = true;
                    log(
                        `Cost cap ${opts.maxCostPollen} Pollen reached at ${model.name}`,
                    );
                    break;
                }
                const result = await runQuestion({
                    model,
                    question,
                    runSeed,
                    options: opts,
                    fetchFn,
                    log,
                });
                totalCost.pollen += result.costPollen;
                questionResults.push(result);
            }
            if (questionResults.length === questions.length) {
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
    };
}
