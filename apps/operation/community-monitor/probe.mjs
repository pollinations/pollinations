#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";

// One probe sweep across active community text and image models via
// gen.pollinations.ai. Text probes are cost-weighted and run every cycle;
// image probes run once per model every four hours and are always capped at
// one generation. This keeps coverage current without spending or generating
// media every 15 minutes.
// Actual spend is reconciled from real `usage` tokens and fed back into
// state.json so next cycle's budget self-corrects (overspend -> undershoot).
// Writes /home/ubuntu/monitor/probe-results.json and prints a summary table.

const TOKEN = process.env.POLLI_TOKEN;
if (!TOKEN) {
    console.error("POLLI_TOKEN missing");
    process.exit(1);
}
const GEN = process.env.POLLINATIONS_GEN_URL ?? "https://gen.pollinations.ai";
const CONCURRENCY = 4;
const TEXT_TIMEOUT_MS = 45_000;
const IMAGE_TIMEOUT_MS = 150_000;
const IMAGE_PROBE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STATE_PATH =
    process.env.MONITOR_STATE_PATH ?? "/home/ubuntu/monitor/state.json";
const RESULTS_PATH =
    process.env.MONITOR_RESULTS_PATH ??
    "/home/ubuntu/monitor/probe-results.json";
const TARGET_POLLEN = 0.5;
// Keep next cycle's budget within a sane band around the target so one wild
// cycle (e.g. a model timing out after burning tokens) can't spiral.
const MIN_BUDGET = TARGET_POLLEN * 0.4;
const MAX_BUDGET = TARGET_POLLEN * 1.6;
const MAX_TOKENS = 10;
// Rough estimate for planning only -- actual spend is reconciled from real
// `usage` in each response, not from these constants.
const EST_PROMPT_TOKENS = 20;
const EST_COMPLETION_TOKENS = 8;
const EST_IMAGE_OUTPUT_TOKENS = 1120;

const modelArgIndex = process.argv.indexOf("--model");
const onlyModel = modelArgIndex === -1 ? null : process.argv[modelArgIndex + 1];
if (modelArgIndex !== -1 && !onlyModel) {
    console.error("--model requires an owner/model id");
    process.exit(1);
}

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
    return models.filter(
        (m) =>
            m.community &&
            m.name?.includes("/") &&
            (m.category === "text" || m.category === "image"),
    );
}

function estimateCost(model) {
    const p = Number(model.pricing?.promptTextTokens ?? 0);
    const c = Number(model.pricing?.completionTextTokens ?? 0);
    if (model.category === "image") {
        const image = Number(model.pricing?.completionImageTokens ?? 0);
        return model.flat_rate
            ? image
            : p * EST_PROMPT_TOKENS + image * EST_IMAGE_OUTPUT_TOKENS;
    }
    return p * EST_PROMPT_TOKENS + c * EST_COMPLETION_TOKENS;
}

// Baseline rank-based targets, cheapest quartile first. Ranking (not raw
// cost) drives this, so "test expensive models less" holds even if the whole
// catalog happens to be cheap or expensive that week -- it's always relative.
// Keep synthetic traffic light: production data showed that larger sweeps can
// consume a meaningful share of low-capacity community-provider quotas.
const TIER_TARGETS = [4, 3, 2, 1];
// Hard per-model ceiling, regardless of price or budget -- this is a health
// probe, not a load test, and upstream owners may have their own rate limits.
// Free models in particular must never be used to "soak up" leftover budget.
const MAX_REQUESTS_PER_MODEL = 4;

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
    const textByCostAsc = models
        .filter((m) => m.category === "text")
        .sort((a, b) => perModelCost.get(a.name) - perModelCost.get(b.name));

    const counts = new Map();
    const tierSize = Math.max(
        1,
        Math.ceil(textByCostAsc.length / TIER_TARGETS.length),
    );
    textByCostAsc.forEach((m, i) => {
        const tier = Math.min(
            Math.floor(i / tierSize),
            TIER_TARGETS.length - 1,
        );
        counts.set(
            m.name,
            Math.min(TIER_TARGETS[tier], MAX_REQUESTS_PER_MODEL),
        );
    });
    for (const model of models) {
        if (model.category === "image") counts.set(model.name, 1);
    }

    let spent = models.reduce(
        (sum, m) => sum + perModelCost.get(m.name) * counts.get(m.name),
        0,
    );

    const textByCostDesc = [...textByCostAsc].reverse();

    if (spent > budget) {
        // Trim extras (never below 1) from the most expensive models first,
        // since those are the ones we most want to under-test vs. cheap ones.
        let i = 0;
        while (spent > budget && i < textByCostDesc.length) {
            const m = textByCostDesc[i];
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
        const payable = textByCostDesc.filter(
            (m) => perModelCost.get(m.name) > 0,
        );
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

// Basic billing-integrity sanity checks on a single probe response. These are
// NOT health/deactivation signals (CYCLE.md's 5xx/timeout rules own that) --
// they flag "the numbers we're about to pay this owner on look implausible
// for a short, cache-busted prompt", for a human to investigate. Thresholds are
// deliberately loose (calibrated against real tokenizer variance seen across
// the catalog: a 7-word prompt legitimately tokenizes anywhere from ~7 to
// ~35 tokens depending on the model's tokenizer) -- the goal is to catch
// clear anomalies (0, or 10x+ too many), not to nitpick normal variance.
function billingSanityFlags(usage, content) {
    const flags = [];
    if (!usage) {
        flags.push("no usage object returned");
        return flags;
    }
    const {
        prompt_tokens: p,
        completion_tokens: c,
        total_tokens: total,
    } = usage;
    const cached =
        usage.prompt_tokens_details?.cached_tokens ??
        usage.cached_input_tokens ??
        usage.cache_read_input_tokens ??
        0;
    if (p === 0) flags.push("prompt_tokens=0 for a non-empty prompt");
    if (cached > 0)
        flags.push("cached tokens on a cache-busted single-message prompt");
    if (p != null && cached > p)
        flags.push("cached_tokens exceeds prompt_tokens");
    const reasoning =
        usage.completion_tokens_details?.reasoning_tokens ??
        usage.reasoning_tokens ??
        0;
    if (c != null && reasoning > c)
        flags.push("reasoning_tokens exceeds completion_tokens");
    if (p != null && c != null && total != null && total !== p + c)
        flags.push(
            "total_tokens differs from prompt_tokens + completion_tokens",
        );
    const uncached = p != null && cached <= p ? p - cached : undefined;
    if (uncached != null && uncached > 100)
        flags.push("implausible uncached prompt token count");
    if (c === 0) flags.push("completion_tokens=0 despite a successful reply");
    if (!content?.trim()) flags.push("empty completion content");
    return flags;
}

function imageBillingSanityFlags(usage) {
    const flags = [];
    if (!usage) {
        flags.push("no image usage object returned");
        return flags;
    }
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    const total = usage.total_tokens;
    const text = usage.input_tokens_details?.text_tokens;
    const image = usage.input_tokens_details?.image_tokens;
    if (output === 0) flags.push("output_tokens=0 despite a generated image");
    if (
        input != null &&
        text != null &&
        image != null &&
        input !== text + image
    )
        flags.push(
            "image input_tokens differs from text_tokens + image_tokens",
        );
    if (
        input != null &&
        output != null &&
        total != null &&
        total !== input + output
    )
        flags.push(
            "image total_tokens differs from input_tokens + output_tokens",
        );
    return flags;
}

async function probeText(model) {
    const started = Date.now();
    const marker = `ok-${randomUUID().slice(0, 8)}`;
    const prompt = `Reply with exactly: ${marker}`;
    // The abort timer must stay armed through the BODY read, not just until
    // headers arrive: a stalled response stream otherwise hangs this job --
    // and, with it, the whole sweep -- forever. This exact hang killed every
    // sweep from 2026-07-20 08:29 until it was found a day later.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEXT_TIMEOUT_MS);
    try {
        const res = await fetch(`${GEN}/v1/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model.name,
                messages: [{ role: "user", content: prompt }],
                max_tokens: MAX_TOKENS,
            }),
            signal: ctrl.signal,
        });
        const body = await res.text();
        let usage;
        let content;
        if (res.ok) {
            try {
                const parsed = JSON.parse(body);
                usage = parsed.usage;
                content = parsed.choices?.[0]?.message?.content;
            } catch {
                // leave usage/content undefined -- reconciliation/checks just skip this request
            }
        }
        const result = {
            model: model.name,
            category: model.category,
            ok: res.ok,
            status: res.status,
            ms: Date.now() - started,
            usage,
            probeMarker: marker,
            detail: res.ok ? undefined : body.slice(0, 300),
        };
        if (res.ok) result.billingFlags = billingSanityFlags(usage, content);
        return result;
    } catch (err) {
        return {
            model: model.name,
            category: model.category,
            ok: false,
            status: "ERR",
            ms: Date.now() - started,
            detail: String(err).slice(0, 200),
        };
    } finally {
        clearTimeout(t);
    }
}

async function probeImage(model) {
    const started = Date.now();
    const marker = `image-${randomUUID().slice(0, 8)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
    try {
        const res = await fetch(`${GEN}/v1/images/generations`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model.name,
                prompt: `A plain test card labeled ${marker}`,
                n: 1,
                response_format: "b64_json",
            }),
            signal: ctrl.signal,
        });
        const body = await res.text();
        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch {
            // handled below as an invalid successful response
        }
        const imageBase64 = parsed?.data?.[0]?.b64_json;
        const hasImage =
            typeof imageBase64 === "string" &&
            Buffer.from(imageBase64, "base64").byteLength > 100;
        const ok = res.ok && hasImage;
        const result = {
            model: model.name,
            category: model.category,
            ok,
            status: res.ok && !hasImage ? "INVALID" : res.status,
            ms: Date.now() - started,
            usage: parsed?.usage,
            probeMarker: marker,
            detail: res.ok
                ? hasImage
                    ? undefined
                    : "successful response did not contain a valid b64_json image"
                : body.slice(0, 300),
        };
        if (res.ok) {
            result.billingFlags = imageBillingSanityFlags(parsed?.usage);
        }
        return result;
    } catch (err) {
        return {
            model: model.name,
            category: model.category,
            ok: false,
            status: "ERR",
            ms: Date.now() - started,
            detail: String(err).slice(0, 200),
        };
    } finally {
        clearTimeout(t);
    }
}

function probe(model) {
    return model.category === "image" ? probeImage(model) : probeText(model);
}

function actualCost(result, priceByModel) {
    if (!result.usage) return 0;
    const price = priceByModel.get(result.model);
    if (!price) return 0;
    if (result.category === "image") {
        const inputText = result.usage.input_tokens_details?.text_tokens ?? 0;
        const inputImage = result.usage.input_tokens_details?.image_tokens ?? 0;
        const outputImage = result.usage.output_tokens ?? 0;
        return (
            inputText * price.promptTextTokens +
            inputImage * price.promptImageTokens +
            outputImage * price.completionImageTokens
        );
    }
    const promptTokens = result.usage.prompt_tokens ?? 0;
    const completionTokens = result.usage.completion_tokens ?? 0;
    return (
        promptTokens * price.promptTextTokens +
        completionTokens * price.completionTextTokens
    );
}

const models = await fetchCommunityModels();
if (onlyModel && !models.some((model) => model.name === onlyModel)) {
    console.error(`active community model not found: ${onlyModel}`);
    process.exit(1);
}
const priceByModel = new Map(
    models.map((m) => [
        m.name,
        {
            promptTextTokens: Number(m.pricing?.promptTextTokens ?? 0),
            promptImageTokens: Number(m.pricing?.promptImageTokens ?? 0),
            completionTextTokens: Number(m.pricing?.completionTextTokens ?? 0),
            completionImageTokens: Number(
                m.pricing?.completionImageTokens ?? 0,
            ),
        },
    ]),
);

const state = readState();
const now = Date.now();
const lastImageProbeAt = state.spend?.lastImageProbeAt ?? {};
const imageProbeDue = (model) => {
    const previous = Date.parse(lastImageProbeAt[model.name] ?? "");
    return (
        !Number.isFinite(previous) || now - previous >= IMAGE_PROBE_INTERVAL_MS
    );
};
const modelsToProbe = onlyModel
    ? models.filter((model) => model.name === onlyModel)
    : models.filter(
          (model) => model.category === "text" || imageProbeDue(model),
      );
const skippedImageModels = onlyModel
    ? []
    : models
          .filter(
              (model) => model.category === "image" && !imageProbeDue(model),
          )
          .map((model) => model.name);
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

const { counts, estimatedSpend } = onlyModel
    ? {
          counts: new Map([[onlyModel, 1]]),
          estimatedSpend: estimateCost(modelsToProbe[0]),
      }
    : planRequestCounts(modelsToProbe, budget);

const jobs = [];
for (const model of modelsToProbe) {
    const n = counts.get(model.name) ?? 1;
    for (let i = 0; i < n; i++) jobs.push(model);
}

// Worker pool, not batched Promise.all: one slow request must not
// head-of-line-block the other CONCURRENCY-1 slots for up to its timeout.
const results = [];
let nextJob = 0;
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        while (nextJob < jobs.length) {
            const i = nextJob++;
            results[i] = await probe(jobs[i]);
        }
    }),
);

const actualSpend = results.reduce(
    (sum, r) => sum + actualCost(r, priceByModel),
    0,
);

// Persist spend history for next cycle's adaptive budget. probe.mjs owns only
// the `spend` key in state.json -- CYCLE.md/the agent owns everything else and
// read-modify-writes this file, so merge rather than clobber. Re-read the
// file NOW rather than reusing the startup snapshot: the sweep takes minutes
// and the agent rewrites state.json in the meantime -- merging into the old
// snapshot would silently revert those writes.
const currentState = readState();
const nextState = {
    ...currentState,
    spend: {
        ...currentState.spend,
        lastCycleBudget: budget,
        lastEstimatedPollen: estimatedSpend,
        lastActualPollen: actualSpend,
        lastRequestCount: jobs.length,
        lastRunAt: new Date().toISOString(),
        lastImageProbeAt: {
            ...currentState.spend?.lastImageProbeAt,
            ...Object.fromEntries(
                modelsToProbe
                    .filter((model) => model.category === "image")
                    .map((model) => [model.name, new Date(now).toISOString()]),
            ),
        },
    },
};
fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2));

// Aggregate billing-sanity flags per model (union across its probes this
// cycle) -- surfaced separately from health status since a model can be
// perfectly healthy (200s, fast) while still reporting implausible usage.
const billingFlagsByModel = {};
for (const r of results) {
    if (!r.billingFlags?.length) continue;
    const set = new Set(billingFlagsByModel[r.model] ?? []);
    for (const f of r.billingFlags) set.add(f);
    billingFlagsByModel[r.model] = [...set];
}

const out = {
    ts: new Date().toISOString(),
    budget,
    actualSpend,
    imageProbeIntervalHours: IMAGE_PROBE_INTERVAL_MS / 3_600_000,
    skippedImageModels,
    results,
    billingFlagsByModel,
};
fs.writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2));

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
if (skippedImageModels.length) {
    console.log(
        `${skippedImageModels.length} image models not due (4h cadence)`,
    );
}
console.log(
    `budget ${budget.toFixed(4)} pollen -> estimated ${estimatedSpend.toFixed(4)}, actual ${actualSpend.toFixed(4)}`,
);
const flaggedModels = Object.keys(billingFlagsByModel);
if (flaggedModels.length) {
    console.log(`\nbilling sanity flags (${flaggedModels.length} models):`);
    for (const model of flaggedModels) {
        console.log(`  ${model}: ${billingFlagsByModel[model].join("; ")}`);
    }
}
