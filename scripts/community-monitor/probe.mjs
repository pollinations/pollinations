#!/usr/bin/env node
// One probe sweep across all active community models via gen.pollinations.ai.
// Cost-weighted: cheap models get more requests than expensive ones (see
// planRequestCounts), every model capped at MAX_REQUESTS_PER_MODEL so no
// upstream -- free or paid -- ever gets hammered. ~TARGET_POLLEN is a spend
// ceiling to aim under, not a hard target; the per-model cap usually keeps
// actual spend well below it since most community models are near-free.
// Actual spend is reconciled from real `usage` tokens and fed back into
// state.json so next cycle's budget self-corrects (overspend -> undershoot).
// Writes /home/ubuntu/monitor/probe-results.json and prints a summary table.
import fs from "node:fs";

const TOKEN = process.env.POLLI_TOKEN;
if (!TOKEN) {
    console.error("POLLI_TOKEN missing");
    process.exit(1);
}
const GEN = "https://gen.pollinations.ai";
const CONCURRENCY = 4;
const TIMEOUT_MS = 45_000;
const STATE_PATH = "/home/ubuntu/monitor/state.json";
const TARGET_POLLEN = 0.5;
// Keep next cycle's budget within a sane band around the target so one wild
// cycle (e.g. a model timing out after burning tokens) can't spiral.
const MIN_BUDGET = TARGET_POLLEN * 0.4;
const MAX_BUDGET = TARGET_POLLEN * 1.6;
const PROMPT = "Reply with the single word: ok";
const MAX_TOKENS = 10;
// Rough estimate for planning only -- actual spend is reconciled from real
// `usage` in each response, not from these constants.
const EST_PROMPT_TOKENS = 20;
const EST_COMPLETION_TOKENS = 8;

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    } catch {
        return {};
    }
}

// Pricing is public, no auth needed: https://gen.pollinations.ai/models
async function fetchCommunityModels() {
    const list = await fetch(`${GEN}/models`).then((r) => r.json());
    const models = Array.isArray(list) ? list : (list.data ?? list);
    return models.filter((m) => m.community && m.name?.includes("/"));
}

function estimateCost(model) {
    const p = Number(model.pricing?.promptTextTokens ?? 0);
    const c = Number(model.pricing?.completionTextTokens ?? 0);
    return p * EST_PROMPT_TOKENS + c * EST_COMPLETION_TOKENS;
}

// Baseline rank-based targets, cheapest quartile first. Ranking (not raw
// cost) drives this, so "test expensive models less" holds even if the whole
// catalog happens to be cheap or expensive that week -- it's always relative.
const TIER_TARGETS = [5, 4, 2, 1];
// Hard per-model ceiling, regardless of price or budget -- this is a health
// probe, not a load test, and upstream owners may have their own rate limits.
// Free models in particular must never be used to "soak up" leftover budget.
const MAX_REQUESTS_PER_MODEL = 5;

// Every model gets a rank-based baseline (cheapest quartile: most requests,
// priciest quartile: floor of 1). If that overshoots budget, trim extras from
// the most expensive models first (never below 1). If it undershoots -- the
// common case, since most models are fractions of a cent per request -- top
// up extra requests on the MOST EXPENSIVE models first (not cheap ones) up to
// MAX_REQUESTS_PER_MODEL, since those are what actually moves total spend
// toward the target; cheap models are already capped and can't absorb more
// budget usefully. Every model's count is capped at MAX_REQUESTS_PER_MODEL in
// all cases, so no single model -- expensive or free -- ever gets hammered.
function planRequestCounts(models, budget) {
    const perModelCost = new Map(models.map((m) => [m.name, estimateCost(m)]));
    const byCostAsc = [...models].sort(
        (a, b) => perModelCost.get(a.name) - perModelCost.get(b.name),
    );

    const tierSize = Math.ceil(byCostAsc.length / TIER_TARGETS.length);
    const counts = new Map();
    byCostAsc.forEach((m, i) => {
        const tier = Math.min(
            Math.floor(i / tierSize),
            TIER_TARGETS.length - 1,
        );
        counts.set(m.name, Math.min(TIER_TARGETS[tier], MAX_REQUESTS_PER_MODEL));
    });

    let spent = byCostAsc.reduce(
        (sum, m) => sum + perModelCost.get(m.name) * counts.get(m.name),
        0,
    );

    const byCostDesc = [...byCostAsc].reverse();

    if (spent > budget) {
        // Trim extras (never below 1) from the most expensive models first,
        // since those are the ones we most want to under-test vs. cheap ones.
        let i = 0;
        while (spent > budget && i < byCostDesc.length) {
            const m = byCostDesc[i];
            const n = counts.get(m.name);
            const cost = perModelCost.get(m.name);
            if (n > 1) {
                counts.set(m.name, n - 1);
                spent -= cost;
            } else {
                i++;
            }
        }
    } else {
        // Top up toward budget using the MOST expensive payable models first
        // -- each request there moves spend further per request than another
        // cheap-model request would, and every model is still capped.
        const payable = byCostDesc.filter((m) => perModelCost.get(m.name) > 0);
        let progressed = payable.length > 0;
        while (spent < budget && progressed) {
            progressed = false;
            for (const m of payable) {
                if (counts.get(m.name) >= MAX_REQUESTS_PER_MODEL) continue;
                const cost = perModelCost.get(m.name);
                if (spent + cost > budget) continue;
                counts.set(m.name, counts.get(m.name) + 1);
                spent += cost;
                progressed = true;
            }
        }
    }

    return { counts, estimatedSpend: spent };
}

async function probe(model) {
    const started = Date.now();
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(`${GEN}/v1/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: PROMPT }],
                max_tokens: MAX_TOKENS,
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const body = await res.text();
        let usage;
        if (res.ok) {
            try {
                usage = JSON.parse(body).usage;
            } catch {
                // leave usage undefined -- reconciliation just skips this request
            }
        }
        return {
            model,
            ok: res.ok,
            status: res.status,
            ms: Date.now() - started,
            usage,
            detail: res.ok ? undefined : body.slice(0, 300),
        };
    } catch (err) {
        return {
            model,
            ok: false,
            status: "ERR",
            ms: Date.now() - started,
            detail: String(err).slice(0, 200),
        };
    }
}

function actualCost(result, priceByModel) {
    if (!result.usage) return 0;
    const price = priceByModel.get(result.model);
    if (!price) return 0;
    const promptTokens = result.usage.prompt_tokens ?? 0;
    const completionTokens = result.usage.completion_tokens ?? 0;
    return (
        promptTokens * price.promptTextTokens +
        completionTokens * price.completionTextTokens
    );
}

const models = await fetchCommunityModels();
const priceByModel = new Map(
    models.map((m) => [
        m.name,
        {
            promptTextTokens: Number(m.pricing?.promptTextTokens ?? 0),
            completionTextTokens: Number(m.pricing?.completionTextTokens ?? 0),
        },
    ]),
);

const state = readState();
const lastSpend = state.spend?.lastActualPollen;
// Mean-reversion: if we overspent last cycle, aim lower this cycle, and vice
// versa. First run (no history) just uses the flat target.
const budget =
    typeof lastSpend === "number"
        ? Math.min(
              MAX_BUDGET,
              Math.max(MIN_BUDGET, TARGET_POLLEN * 2 - lastSpend),
          )
        : TARGET_POLLEN;

const { counts, estimatedSpend } = planRequestCounts(models, budget);

const jobs = [];
for (const model of models) {
    const n = counts.get(model.name) ?? 1;
    for (let i = 0; i < n; i++) jobs.push(model.name);
}

const results = [];
for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(probe))));
}

const actualSpend = results.reduce(
    (sum, r) => sum + actualCost(r, priceByModel),
    0,
);

// Persist spend history for next cycle's adaptive budget. probe.mjs owns only
// the `spend` key in state.json -- CYCLE.md/the agent owns everything else and
// read-modify-writes this file, so merge rather than clobber.
const nextState = {
    ...state,
    spend: {
        lastCycleBudget: budget,
        lastEstimatedPollen: estimatedSpend,
        lastActualPollen: actualSpend,
        lastRequestCount: jobs.length,
        lastRunAt: new Date().toISOString(),
    },
};
fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2));

const out = { ts: new Date().toISOString(), budget, actualSpend, results };
fs.writeFileSync(
    "/home/ubuntu/monitor/probe-results.json",
    JSON.stringify(out, null, 2),
);

// Per-model summary: worst status per model, plus request count.
const byModel = new Map();
for (const r of results) {
    const cur = byModel.get(r.model);
    if (!cur || (cur.ok && !r.ok)) {
        byModel.set(r.model, { ...r, count: (cur?.count ?? 0) + 1 });
    } else {
        cur.count += 1;
    }
}
for (const r of [...byModel.values()].sort(
    (a, b) => Number(a.ok) - Number(b.ok),
)) {
    console.log(
        `${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} x${r.count}  ${String(r.ms).padStart(6)}ms  ${r.model}`,
    );
}
console.log(
    `${results.filter((r) => r.ok).length}/${results.length} requests healthy across ${byModel.size} models`,
);
console.log(
    `budget ${budget.toFixed(4)} pollen -> estimated ${estimatedSpend.toFixed(4)}, actual ${actualSpend.toFixed(4)}`,
);
