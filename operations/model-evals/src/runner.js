import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateQuestion, gradeQuestion } from "./questions.js";
import { attachOfficialMatches } from "./model-match.js";
import { wilsonMargin } from "./stats.js";

export const MODELS_URL = "https://gen.pollinations.ai/text/models";
export const CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";

export function seededRng(seed) {
    let state = seed >>> 0;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function selectModels(models, { communityOnly = false, modelFilter = null }) {
    let selected = models.filter((model) => (model.category ?? "text") === "text");
    if (communityOnly) selected = selected.filter((model) => Boolean(model.community));
    if (!modelFilter?.length) return selected;
    const wanted = new Set(modelFilter.map((name) => name.toLowerCase()));
    return selected.filter((model) =>
        [model.name, ...(model.aliases ?? [])]
            .filter(Boolean)
            .some((name) => wanted.has(name.toLowerCase())),
    );
}

export function tokenCost(usage, pricing) {
    if (!usage || !pricing) return 0;
    const number = (value) => Number.parseFloat(value ?? 0) || 0;
    return (
        number(usage.prompt_tokens) *
            number(pricing.promptTextTokens ?? pricing.promptTokens) +
        number(usage.completion_tokens) *
            number(pricing.completionTextTokens ?? pricing.completionTokens)
    );
}

function retryDelayMs(response, attempt) {
    const retryAfter = Number(response.headers?.get?.("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(30_000, retryAfter * 1000);
    }
    return Math.min(30_000, 1500 * 2 ** attempt);
}

function accountErrorText(text) {
    return /not enough credits|low balance|top up.*pollen|insufficient.*pollen/i.test(
        text,
    );
}

export async function requestCompletion({
    fetchFn = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    apiKey,
    model,
    prompt,
    seed,
    maxTokens,
    timeoutMs,
    maxAttempts = 5,
}) {
    let lastError = "request failed";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        try {
            const response = await fetchFn(CHAT_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: maxTokens,
                    seed,
                }),
                signal: controller.signal,
            });
            const latencyMs = Date.now() - started;
            if (response.status === 429 || response.status >= 500) {
                lastError = `HTTP ${response.status}`;
                if (attempt + 1 < maxAttempts) {
                    await sleep(retryDelayMs(response, attempt));
                    continue;
                }
                return { ok: false, error: lastError, latencyMs };
            }
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                return {
                    ok: false,
                    error: `HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
                    latencyMs,
                };
            }
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (typeof content !== "string" || !data.usage || accountErrorText(content)) {
                return {
                    ok: false,
                    error: accountErrorText(content ?? "")
                        ? "account/balance response"
                        : "missing completion content or usage",
                    latencyMs,
                };
            }
            return { ok: true, content, usage: data.usage, latencyMs };
        } catch (error) {
            const latencyMs = Date.now() - started;
            const aborted = error?.name === "AbortError";
            lastError = aborted ? "timeout" : String(error?.message ?? error);
            if (!aborted && attempt + 1 < maxAttempts) {
                await sleep(Math.min(10_000, 750 * 2 ** attempt));
                continue;
            }
            return { ok: false, error: lastError, latencyMs };
        } finally {
            clearTimeout(timer);
        }
    }
    return { ok: false, error: lastError, latencyMs: 0 };
}

export async function evaluateModel(model, options) {
    const trials = [];
    // Every model must receive the exact same generated question instances within a run.
    // The request seed still varies by model/trial below to bust the gateway cache.
    const rng = seededRng(options.runSeed);
    let sequence = 0;
    for (const family of options.families) {
        for (let repeat = 0; repeat < options.trials; repeat++) {
            const question = generateQuestion(family, rng);
            const requestSeed =
                (options.runSeed + hashString(model.name) + sequence * 1009) >>> 0;
            sequence += 1;
            const response = await requestCompletion({
                fetchFn: options.fetchFn,
                sleep: options.sleep,
                apiKey: options.apiKey,
                model: model.name,
                prompt: question.prompt,
                seed: requestSeed,
                maxTokens: options.maxTokens,
                timeoutMs: options.timeoutMs,
                maxAttempts: options.maxAttempts,
            });
            const cost = response.ok ? tokenCost(response.usage, model.pricing) : 0;
            trials.push({
                family,
                repeat,
                seed: requestSeed,
                ok: response.ok,
                correct: response.ok
                    ? gradeQuestion(family, response.content, question.answer)
                    : false,
                prompt: question.prompt,
                expected: question.answer,
                output: response.ok ? response.content.slice(0, 1000) : null,
                error: response.ok ? null : response.error,
                latencyMs: response.latencyMs,
                cost,
            });
        }
    }

    const correct = trials.filter((trial) => trial.correct).length;
    const total = trials.length;
    const failures = trials.filter((trial) => !trial.ok).length;
    const cost = trials.reduce((sum, trial) => sum + trial.cost, 0);
    const familyRows = Object.fromEntries(
        options.families.map((family) => {
            const rows = trials.filter((trial) => trial.family === family);
            const familyCorrect = rows.filter((trial) => trial.correct).length;
            return [
                family,
                {
                    correct: familyCorrect,
                    total: rows.length,
                    failures: rows.filter((trial) => !trial.ok).length,
                    score: rows.length ? familyCorrect / rows.length : 0,
                    marginOfError: wilsonMargin(familyCorrect, rows.length),
                },
            ];
        }),
    );

    return {
        model: model.name,
        community: Boolean(model.community),
        score: total ? correct / total : 0,
        marginOfError: wilsonMargin(correct, total),
        correct,
        total,
        failures,
        cost,
        averageLatencyMs:
            total > 0
                ? trials.reduce((sum, trial) => sum + trial.latencyMs, 0) / total
                : 0,
        families: familyRows,
        trials,
    };
}

export function finalizeComparisons(results) {
    return attachOfficialMatches(results).sort(
        (a, b) => b.score - a.score || a.model.localeCompare(b.model),
    );
}

export async function writeRun(resultsDir, payload) {
    await mkdir(resultsDir, { recursive: true });
    const runFile = path.join(resultsDir, `${payload.runId}.json`);
    const latestFile = path.join(resultsDir, "latest.json");
    const indexFile = path.join(resultsDir, "index.json");
    let previous = { runs: [] };
    try {
        previous = JSON.parse(await readFile(indexFile, "utf8"));
    } catch {}
    const summary = {
        runId: payload.runId,
        createdAt: payload.createdAt,
        totalCost: payload.totalCost,
        modelCount: payload.models.length,
    };
    const runs = [
        summary,
        ...(previous.runs ?? []).filter((entry) => entry.runId !== payload.runId),
    ].slice(0, 104);
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    await Promise.all([
        writeFile(runFile, json),
        writeFile(latestFile, json),
        writeFile(indexFile, `${JSON.stringify({ runs }, null, 2)}\n`),
    ]);
    return runFile;
}
