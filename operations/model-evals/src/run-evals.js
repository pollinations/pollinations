#!/usr/bin/env node
// Scores every text model on gen.pollinations.ai against a small set of
// eval question families and writes a leaderboard JSON. See
// operations/model-evals/README.md for usage.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findOfficialMatch } from "./matchOfficial.js";
import {
    FAMILIES,
    generateQuestion,
    gradeAnswer,
    marginOfError,
} from "./questions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, "..", "results");
const MODELS_URL = "https://gen.pollinations.ai/text/models";
const CHAT_URL = "https://gen.pollinations.ai/v1/chat/completions";

function mulberry32(seed) {
    let a = seed;
    return function rng() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function parseCliArgs(argv) {
    const { values } = parseArgs({
        args: argv,
        options: {
            community: { type: "boolean", default: false },
            models: { type: "string" },
            trials: { type: "string", default: "3" },
            families: { type: "string", default: FAMILIES.join(",") },
            "max-tokens": { type: "string", default: "400" },
            "timeout-ms": { type: "string", default: "30000" },
            concurrency: { type: "string", default: "5" },
            out: { type: "string" },
        },
    });
    return {
        communityOnly: values.community,
        modelFilter: values.models
            ? values.models.split(",").map((m) => m.trim().toLowerCase())
            : null,
        trials: Number.parseInt(values.trials, 10),
        families: values.families.split(",").map((f) => f.trim()),
        maxTokens: Number.parseInt(values["max-tokens"], 10),
        timeoutMs: Number.parseInt(values["timeout-ms"], 10),
        concurrency: Number.parseInt(values.concurrency, 10),
        outPath: values.out || null,
    };
}

async function fetchModels() {
    const res = await fetch(MODELS_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch model list: ${res.status}`);
    }
    const all = await res.json();
    return all.filter((m) => m.category === "text");
}

function selectModels(models, opts) {
    let selected = models;
    if (opts.communityOnly) {
        selected = selected.filter((m) => m.community);
    }
    if (opts.modelFilter) {
        selected = selected.filter((m) => {
            const names = [m.name, ...(m.aliases || [])].map((n) =>
                n.toLowerCase(),
            );
            return opts.modelFilter.some((wanted) => names.includes(wanted));
        });
    }
    return selected;
}

function tokenCost(usage, pricing) {
    if (!usage || !pricing) return 0;
    const promptRate = Number.parseFloat(pricing.promptTextTokens || "0");
    const completionRate = Number.parseFloat(
        pricing.completionTextTokens || "0",
    );
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    return promptTokens * promptRate + completionTokens * completionRate;
}

async function runTrial(model, question, apiKey, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
        const res = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model.name,
                messages: [{ role: "user", content: question.prompt }],
                max_tokens: opts.maxTokens,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            return {
                correct: false,
                failed: true,
                cost: 0,
                error: `HTTP ${res.status}`,
            };
        }
        const data = await res.json();
        const replyText = data.choices?.[0]?.message?.content || "";
        const correct = gradeAnswer(question, replyText);
        const cost = tokenCost(data.usage, model.pricing);
        return { correct, failed: false, cost };
    } catch (err) {
        return { correct: false, failed: true, cost: 0, error: err.message };
    } finally {
        clearTimeout(timer);
    }
}

async function scoreModel(model, apiKey, opts) {
    const rng = mulberry32(Date.now() ^ (Math.random() * 2 ** 31));
    const familyResults = {};
    let correct = 0;
    let total = 0;
    let failed = 0;
    let cost = 0;

    for (const family of opts.families) {
        let familyCorrect = 0;
        for (let i = 0; i < opts.trials; i++) {
            const question = generateQuestion(family, rng);
            const result = await runTrial(model, question, apiKey, opts);
            total += 1;
            cost += result.cost;
            if (result.failed) failed += 1;
            if (result.correct) {
                correct += 1;
                familyCorrect += 1;
            }
        }
        familyResults[family] = { correct: familyCorrect, total: opts.trials };
    }

    return {
        name: model.name,
        title: model.title,
        publisher: model.publisher,
        community: !!model.community,
        correct,
        total,
        failed,
        score: total > 0 ? correct / total : 0,
        marginOfError: marginOfError(correct, total),
        costPollen: cost,
        families: familyResults,
    };
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return results;
}

function attachOfficialComparison(modelResults, officialModels) {
    const officialByName = new Map(
        modelResults.filter((m) => !m.community).map((m) => [m.name, m]),
    );
    for (const result of modelResults) {
        if (!result.community) continue;
        const match = findOfficialMatch(
            { name: result.name, community: true },
            officialModels,
        );
        if (!match) continue;
        const officialResult = officialByName.get(match.name);
        if (!officialResult) continue;
        const gap = result.score - officialResult.score;
        const combinedMargin =
            result.marginOfError + officialResult.marginOfError;
        result.comparedToOfficial = {
            officialModel: match.name,
            gap,
            exceedsMarginOfError: Math.abs(gap) > combinedMargin,
        };
    }
}

async function writeResults(run) {
    await mkdir(RESULTS_DIR, { recursive: true });
    const filePath = path.join(RESULTS_DIR, `${run.runId}.json`);
    await writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`);

    const indexPath = path.join(RESULTS_DIR, "index.json");
    let index = [];
    try {
        index = JSON.parse(await readFile(indexPath, "utf8"));
    } catch {
        // no history yet
    }
    index = index.filter((entry) => entry.runId !== run.runId);
    index.push({ runId: run.runId, generatedAt: run.generatedAt });
    index.sort((a, b) => a.runId.localeCompare(b.runId));
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    await writeFile(
        path.join(RESULTS_DIR, "latest.json"),
        `${JSON.stringify(run, null, 2)}\n`,
    );
    return filePath;
}

export async function main(argv = process.argv.slice(2)) {
    const opts = parseCliArgs(argv);
    const apiKey = process.env.POLLINATIONS_TOKEN;
    if (!apiKey) {
        throw new Error("POLLINATIONS_TOKEN environment variable is required");
    }

    const allModels = await fetchModels();
    const targetModels = selectModels(allModels, opts);
    if (targetModels.length === 0) {
        throw new Error("No models matched the given filters");
    }

    console.log(
        `Scoring ${targetModels.length} model(s) on ${opts.families.join(", ")} ` +
            `(${opts.trials} trial(s) each)...`,
    );

    const modelResults = await mapWithConcurrency(
        targetModels,
        opts.concurrency,
        async (model) => {
            const result = await scoreModel(model, apiKey, opts);
            console.log(
                `  ${result.name}: ${(result.score * 100).toFixed(1)}% ` +
                    `(+/-${(result.marginOfError * 100).toFixed(1)}pp, ` +
                    `${result.failed} failed, ${result.costPollen.toFixed(4)} Pollen)`,
            );
            return result;
        },
    );

    attachOfficialComparison(
        modelResults,
        allModels.filter((m) => !m.community),
    );

    modelResults.sort((a, b) => b.score - a.score);

    const totalCost = modelResults.reduce((sum, m) => sum + m.costPollen, 0);
    const runId = new Date().toISOString().slice(0, 10);
    const run = {
        runId,
        generatedAt: new Date().toISOString(),
        families: opts.families,
        trialsPerFamily: opts.trials,
        totalCostPollen: totalCost,
        models: modelResults,
    };

    if (opts.outPath) {
        await writeFile(opts.outPath, `${JSON.stringify(run, null, 2)}\n`);
        console.log(`\nWrote results to ${opts.outPath}`);
    } else {
        const filePath = await writeResults(run);
        console.log(`\nWrote results to ${filePath}`);
    }
    console.log(`Total cost: ${totalCost.toFixed(4)} Pollen`);
    return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
