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
    if (!(budgetPollen > 0)) throw new Error(bd);
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
