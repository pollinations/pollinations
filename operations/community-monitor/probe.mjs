#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";

// One probe sweep across listed community text and image models via
// gen.pollinations.ai. Text models get one request every cycle; image models
// get one request every four hours. This keeps full-catalog coverage current
// without letting routine probes consume a provider's quota or the whole
// monitor cycle.
// Actual spend is reconciled from real `usage` tokens and recorded in state.
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
// Reasoning tokens count against this limit. Ten tokens left many healthy
// reasoning models with no final text, so allow enough room for the short
// marker after their internal reasoning.
const MAX_TOKENS = 64;
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
const categoryArgIndex = process.argv.indexOf("--category");
const onlyCategory =
    categoryArgIndex === -1 ? null : process.argv[categoryArgIndex + 1];
if (
    categoryArgIndex !== -1 &&
    onlyCategory !== "text" &&
    onlyCategory !== "image"
) {
    console.error("--category must be text or image");
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
        (m) => m.community && (m.category === "text" || m.category === "image"),
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

// Basic billing-integrity sanity checks on a single probe response. These are
// NOT health/hide signals (CYCLE.md's 5xx/timeout rules own that) --
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
        const hasCompletion =
            typeof content === "string" && content.trim().length > 0;
        const ok = res.ok && hasCompletion;
        const result = {
            model: model.name,
            category: model.category,
            ok,
            status: res.ok && !hasCompletion ? "INVALID" : res.status,
            ms: Date.now() - started,
            usage,
            probeMarker: marker,
            detail: res.ok
                ? hasCompletion
                    ? undefined
                    : "successful response did not contain a non-empty completion"
                : body.slice(0, 300),
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
    if (!onlyCategory) {
        console.error(
            `listed community model not found: ${onlyModel}; pass --category to probe a hidden exact ID`,
        );
        process.exit(1);
    }
    models.push({
        name: onlyModel,
        category: onlyCategory,
        pricing: {},
        flat_rate: false,
    });
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
const estimatedSpend = modelsToProbe.reduce(
    (sum, model) => sum + estimateCost(model),
    0,
);
const jobs = modelsToProbe;

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

// Persist spend history. probe.mjs owns only the `spend` key in state.json --
// CYCLE.md/the agent owns everything else and
// read-modify-writes this file, so merge rather than clobber. Re-read the
// file NOW rather than reusing the startup snapshot: the sweep takes minutes
// and the agent rewrites state.json in the meantime -- merging into the old
// snapshot would silently revert those writes.
const currentState = readState();
const nextState = {
    ...currentState,
    spend: {
        ...currentState.spend,
        lastCycleBudget: undefined,
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
if (!onlyModel) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2));
}

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
    actualSpend,
    imageProbeIntervalHours: IMAGE_PROBE_INTERVAL_MS / 3_600_000,
    skippedImageModels,
    results,
    billingFlagsByModel,
};
if (onlyModel) {
    // Targeted freshness checks return their result without replacing the
    // latest complete sweep or influencing the next sweep's cadence state.
    console.log(JSON.stringify(out));
    process.exit(0);
}
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
    `estimated ${estimatedSpend.toFixed(4)} pollen, actual ${actualSpend.toFixed(4)}`,
);
const flaggedModels = Object.keys(billingFlagsByModel);
if (flaggedModels.length) {
    console.log(`\nbilling sanity flags (${flaggedModels.length} models):`);
    for (const model of flaggedModels) {
        console.log(`  ${model}: ${billingFlagsByModel[model].join("; ")}`);
    }
}
