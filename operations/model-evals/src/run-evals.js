#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FAMILY_NAMES } from "./questions.js";
import {
    evaluateModel,
    finalizeComparisons,
    MODELS_URL,
    selectModels,
    writeRun,
} from "./runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultResults = path.join(here, "..", "results");

function positiveInteger(value, name) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be > 0`);
    return parsed;
}

function parseOptions(argv) {
    const { values } = parseArgs({
        args: argv,
        options: {
            community: { type: "boolean", default: false },
            models: { type: "string" },
            families: { type: "string", default: FAMILY_NAMES.join(",") },
            trials: { type: "string", default: "3" },
            concurrency: { type: "string", default: "3" },
            "max-tokens": { type: "string", default: "160" },
            "timeout-ms": { type: "string", default: "90000" },
            "max-attempts": { type: "string", default: "5" },
            "budget-pollen": { type: "string", default: "19.5" },
            seed: { type: "string" },
            "results-dir": { type: "string", default: defaultResults },
        },
    });
    const families = values.families.split(",").map((v) => v.trim()).filter(Boolean);
    for (const family of families) {
        if (!FAMILY_NAMES.includes(family)) throw new Error(`Unknown family: ${family}`);
    }
    const budgetPollen = Number(values["budget-pollen"]);
    if (!(budgetPollen > 0)) throw new Error("budget-pollen must be > 0");
    return {
        communityOnly: values.community,
        modelFilter: values.models
            ? values.models.split(",").map((v) => v.trim()).filter(Boolean)
            : null,
        families,
        trials: positiveInteger(values.trials, "trials"),
        concurrency: positiveInteger(values.concurrency, "concurrency"),
        maxTokens: positiveInteger(values["max-tokens"], "max-tokens"),
        timeoutMs: positiveInteger(values["timeout-ms"], "timeout-ms"),
        maxAttempts: positiveInteger(values["max-attempts"], "max-attempts"),
        budgetPollen,
        runSeed: values.seed
            ? positiveInteger(values.seed, "seed") >>> 0
            : Math.floor(Date.now() / 1000) >>> 0,
        resultsDir: path.resolve(values["results-dir"]),
    };
}

async function fetchModels() {
    const response = await fetch(MODELS_URL);
    if (!response.ok) throw new Error(`Model catalog failed: HTTP ${response.status}`);
    return response.json();
}

async function main() {
    const options = parseOptions(process.argv.slice(2));
    const apiKey = process.env.POLLINATIONS_TOKEN;
    if (!apiKey) throw new Error("POLLINATIONS_TOKEN is required");

    const catalog = await fetchModels();
    const selected = selectModels(catalog, options);
    if (!selected.length) throw new Error("No models matched the requested filters");

    const queue = [...selected];
    const rows = [];
    let observedCost = 0;
    let budgetExceeded = false;
    console.log(
        `Scoring ${selected.length} model(s); ${options.families.join(", ")} x ${options.trials}; seed=${options.runSeed}`,
    );

    const workers = Array.from(
        { length: Math.min(options.concurrency, queue.length) },
        async () => {
            while (queue.length && !budgetExceeded) {
                const model = queue.shift();
                const row = await evaluateModel(model, { ...options, apiKey });
                rows.push(row);
                observedCost += row.cost;
                console.log(
                    `${row.model} score=${(row.score * 100).toFixed(1)}% ` +
                        `+/-${(row.marginOfError * 100).toFixed(1)}% ` +
                        `failures=${row.failures}/${row.total} cost=${row.cost.toFixed(6)}`,
                );
                if (observedCost >= options.budgetPollen) budgetExceeded = true;
            }
        },
    );
    await Promise.all(workers);

    if (budgetExceeded && rows.length < selected.length) {
        throw new Error(
            `Budget guard reached ${observedCost.toFixed(6)} Pollen before the full run completed`,
        );
    }

    const models = finalizeComparisons(rows);
    const totalCost = models.reduce((sum, row) => sum + row.cost, 0);
    if (totalCost >= 20) {
        throw new Error(`Full run cost ${totalCost.toFixed(6)} Pollen; must remain under 20`);
    }

    const createdAt = new Date().toISOString();
    const runId = createdAt.replace(/[:.]/g, "-").slice(0, 19);
    const payload = {
        schemaVersion: 1,
        runId,
        createdAt,
        runSeed: options.runSeed,
        families: options.families,
        trialsPerFamily: options.trials,
        totalCost,
        models,
    };
    const output = await writeRun(options.resultsDir, payload);
    console.log(`Done: ${models.length} model(s), ${totalCost.toFixed(6)} Pollen, ${output}`);
}

main().catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exit(1);
});
