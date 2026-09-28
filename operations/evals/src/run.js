#!/usr/bin/env node
// Weekly model evals for gen.pollinations.ai — starting with the Alice in
// Wonderland puzzle. See operations/evals/README.md.
//
//   POLLINATIONS_API_KEY=sk_... node src/run.js --limit 5
//   node src/run.js --community-only --repeats 3
//   node src/run.js --models openai/gpt-5.4-nano,community/Creatneworld/pen

import { writeFileSync } from "node:fs";
import { sampleModel } from "./client.js";
import { FAMILIES, FAMILY_NAMES, NAMES, grade, extractAnswer } from "./puzzle.js";
import { makeRng, repeatSeed, runSeed } from "./rng.js";
import { impostorGaps, scoreModel } from "./score.js";

const BASE = process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";
const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";

function parseArgs(argv) {
    const out = { repeats: 1, families: FAMILY_NAMES, concurrency: 4 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === "--limit") out.limit = Number(next());
        else if (a === "--models") out.models = next().split(",").map((s) => s.trim()).filter(Boolean);
        else if (a === "--community-only") out.communityOnly = true;
        else if (a === "--official-only") out.officialOnly = true;
        else if (a === "--repeats") out.repeats = Math.max(1, Number(next()));
        else if (a === "--families") out.families = next().split(",").map((s) => s.trim()).filter(Boolean);
        else if (a === "--seed") out.seed = Number(next());
        else if (a === "--output") out.output = next();
        else if (a === "--json") out.json = true;
        else if (a === "--concurrency") out.concurrency = Math.max(1, Number(next()));
        else if (a === "--help" || a === "-h") out.help = true;
    }
    return out;
}

function usage() {
    console.log(`pollinations model evals (Alice in Wonderland)

Usage: POLLINATIONS_API_KEY=sk_... node src/run.js [options]

Options:
  --limit <n>          score at most n models
  --models <a,b,c>     score only these model names
  --community-only     score only community models
  --official-only      score only official models
  --repeats <n>        questions per family per model (default 1)
  --families <a,b>     subset of: ${FAMILY_NAMES.join(", ")}
  --seed <n>           fixed run seed (default: fresh random)
  --concurrency <n>    parallel requests (default 4)
  --json               print the full report as JSON
  --output <path>      also write the report JSON here
  -h, --help           show this help

Every run uses fresh random numbers, so cached answers do not count.
A model that errors or times out counts as failed, not skipped.`);
}

async function fetchModels() {
    const res = await fetch(`${BASE}/text/models`, {
        headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`GET /text/models -> HTTP ${res.status}`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : (body.data ?? body.models ?? []);
    return list
        .map((m) => ({ name: m.name ?? m.id, pricing: m.pricing ?? null, community: m.community === true }))
        .filter((m) => typeof m.name === "string" && m.name.length > 0)
        .filter((m) => m.output_modalities_ok !== false);
}

function selectModels(all, opts) {
    let models = all;
    if (opts.models) models = models.filter((m) => opts.models.includes(m.name));
    if (opts.communityOnly) models = models.filter((m) => m.community);
    if (opts.officialOnly) models = models.filter((m) => !m.community);
    if (opts.limit) models = models.slice(0, opts.limit);
    return models;
}

function buildQuestions(seed, repeats) {
    // Each (family, repeat) gets fresh numbers, all derived from the run seed.
    const questions = [];
    let i = 0;
    for (const family of FAMILIES_ORDER) {
        for (let r = 0; r < repeats; r++) {
            const rng = makeRng(repeatSeed(seed, i++));
            const name = NAMES[i % NAMES.length];
            const q = FAMILIES[family](rng, name);
            questions.push({ ...q, index: questions.length });
        }
    }
    return questions;
}

let FAMILIES_ORDER = FAMILY_NAMES;

async function evalModel(model, questions, opts, seed) {
    const samples = [];
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const res = await sampleModel({
            baseUrl: BASE,
            apiKey: API_KEY,
            model: model.name,
            prompt: q.prompt,
            seed: repeatSeed(seed, 1000 + i), // vary per request so gen doesn't cache
        });
        samples.push({
            ...res,
            expected: q.expected,
            family: q.family,
            correct: res.ok && grade(res.content, q.expected),
            answer: res.ok ? extractAnswer(res.content) : null,
        });
    }
    return samples;
}

function costPollen(samples, pricing) {
    if (!pricing) return null;
    const pPrompt = Number(pricing.promptTextTokens ?? 0);
    const pCompletion = Number(pricing.completionTextTokens ?? 0);
    let cost = 0;
    for (const s of samples) {
        const u = s.usage;
        if (!u) continue;
        cost += (u.prompt_tokens || 0) * pPrompt + (u.completion_tokens || 0) * pCompletion;
    }
    return cost;
}

async function runPool(items, worker, concurrency) {
    const results = new Array(items.length);
    let next = 0;
    async function lane() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
    return results;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) return usage();
    if (!API_KEY) {
        console.error("POLLINATIONS_API_KEY is required. Get one at https://enter.pollinations.ai/keys");
        process.exit(2);
    }

    FAMILIES_ORDER = FAMILY_NAMES.filter((f) => opts.families.includes(f));
    if (FAMILIES_ORDER.length === 0) throw new Error(`no known families in --families (have ${FAMILY_NAMES.join(", ")})`);

    const seed = runSeed(opts.seed);
    const all = await fetchModels();
    const models = selectModels(all, opts);
    if (models.length === 0) throw new Error("no models matched the selection");
    const questions = buildQuestions(seed, opts.repeats);

    if (!opts.json) {
        console.error(
            `Evals: ${models.length} models x ${questions.length} questions (${FAMILIES_ORDER.join(", ")}), seed ${seed}`,
        );
    }

    const started = Date.now();
    const perModel = await runPool(
        models,
        (m) => evalModel(m, questions, opts, seed),
        opts.concurrency,
    );

    const scores = [];
    let totalCost = 0;
    let costKnown = true;
    for (let i = 0; i < models.length; i++) {
        const samples = perModel[i];
        const score = scoreModel(models[i].name, samples);
        score.community = models[i].community;
        const cost = costPollen(samples, models[i].pricing);
        score.costPollen = cost;
        if (cost === null) costKnown = false;
        else totalCost += cost;
        scores.push(score);
    }

    const ranking = [...scores].sort((a, b) => b.accuracy - a.accuracy || a.margin - b.margin);
    const gaps = impostorGaps(scores);
    const report = {
        eval: "alice-in-wonderland",
        families: FAMILIES_ORDER,
        seed,
        generatedAt: new Date().toISOString(),
        questionsPerModel: questions.length,
        costPollen: costKnown ? totalCost : null,
        costComplete: costKnown,
        elapsedMs: Date.now() - started,
        ranking,
        impostorGaps: gaps,
    };

    if (opts.output) {
        writeFileSync(opts.output, `${JSON.stringify(report, null, 2)}\n`);
    }

    if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log("");
    console.log("Rank  Model                                Accuracy  ±MoE   Correct  Failed  Cost(🌼)");
    ranking.forEach((s, i) => {
        const rank = String(i + 1).padStart(3);
        const name = s.model.length > 34 ? `${s.model.slice(0, 31)}...` : s.model.padEnd(34);
        const acc = `${(s.accuracy * 100).toFixed(0)}%`.padStart(7);
        const moe = `±${(s.margin * 100).toFixed(0)}%`.padStart(6);
        const corr = `${s.correct}/${s.total}`.padStart(8);
        const fail = String(s.failed).padStart(6);
        const cost = s.costPollen === null ? "   n/a" : s.costPollen.toFixed(6).padStart(8);
        console.log(`${rank}   ${name} ${acc}  ${moe} ${corr}  ${fail}  ${cost}`);
    });
    if (gaps.length) {
        console.log("\nCommunity vs official (same base name):");
        for (const g of gaps) {
            const flag = g.highlighted ? "  <= gap exceeds margin" : "";
            console.log(
                `  ${g.community} ${(g.communityAccuracy * 100).toFixed(0)}% vs ${g.official} ${(g.officialAccuracy * 100).toFixed(0)}% (gap ${(g.gap * 100).toFixed(0)}%)${flag}`,
            );
        }
    }
    console.log(
        `\nTotal cost: ${report.costComplete ? `${totalCost.toFixed(6)} 🌼` : "incomplete (missing pricing)"} — seed ${seed}`,
    );
}

main().catch((error) => {
    console.error(`eval failed: ${error.message}`);
    process.exit(1);
});
