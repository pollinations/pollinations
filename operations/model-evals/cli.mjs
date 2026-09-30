#!/usr/bin/env node
// One command scores every text model in /text/models against the AIW
// eval families — community models included — and prints the leaderboard
// with margins of error and the Pollen cost of the run.
//
//   node operations/model-evals/cli.mjs                       # every text model
//   node operations/model-evals/cli.mjs --only community       # only community models
//   node operations/model-evals/cli.mjs --models "openai/gpt-5.4-nano,community/Saauf/gpt-6-luna"
//   node operations/model-evals/cli.mjs --evals aiw --questions 5
//
// The API key comes from POLLINATIONS_API_KEY (get one at
// https://enter.pollinations.ai/keys). Results are written as JSON with
// --out, and --history appends the run to a capped history file.

import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import {
    DEFAULT_BASE_URL,
    fetchTextModels,
    requestCostPollen,
    selectModels,
} from "./catalog.mjs";
import {
    FAMILY_NAMES,
    familyTitle,
    generateQuestionSet,
    isValidFamily,
} from "./questions.mjs";
import { createRng } from "./rng.mjs";
import { DEFAULT_OPTIONS, runEval } from "./runner.mjs";
import { scoreModel } from "./stats.mjs";

const HISTORY_RUN_LIMIT = 26;

export function parseArgs(argv) {
    const args = {
        baseUrl: process.env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL,
        apiKey: process.env.POLLINATIONS_API_KEY ?? null,
        families: [...DEFAULT_OPTIONS.families],
        questionsPerFamily: DEFAULT_OPTIONS.questionsPerFamily,
        concurrency: DEFAULT_OPTIONS.concurrency,
        timeoutMs: DEFAULT_OPTIONS.timeoutMs,
        maxCostPollen: DEFAULT_OPTIONS.maxCostPollen,
        maxTokens: DEFAULT_OPTIONS.maxTokens,
        models: null,
        only: null,
        out: null,
        history: null,
        seed: null,
        list: false,
        quiet: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            i += 1;
            if (i >= argv.length) {
                throw new Error(`${arg} requires a value`);
            }
            return argv[i];
        };
        switch (arg) {
            case "--models":
                args.models = next()
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean);
                break;
            case "--only": {
                const scope = next();
                if (scope !== "community" && scope !== "official") {
                    throw new Error("--only must be community or official");
                }
                args.only = scope;
                break;
            }
            case "--evals": {
                const families = next()
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean);
                for (const family of families) {
                    if (!isValidFamily(family)) {
                        throw new Error(
                            `Unknown eval family: ${family}. Valid: ${FAMILY_NAMES.join(", ")}`,
                        );
                    }
                }
                args.families = families;
                break;
            }
            case "--questions":
                args.questionsPerFamily = Number(next());
                break;
            case "--concurrency":
                args.concurrency = Number(next());
                break;
            case "--timeout-ms":
                args.timeoutMs = Number(next());
                break;
            case "--max-cost":
                args.maxCostPollen = Number(next());
                break;
            case "--max-tokens":
                args.maxTokens = Number(next());
                break;
            case "--out":
                args.out = next();
                break;
            case "--history":
                args.history = next();
                break;
            case "--seed":
                args.seed = Number(next());
                break;
            case "--base-url":
                args.baseUrl = next();
                break;
            case "--api-key":
                args.apiKey = next();
                break;
            case "--list":
                args.list = true;
                break;
            case "--quiet":
                args.quiet = true;
                break;
            case "--help":
            case "-h":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (args.help) return args;
    for (const [key, flag] of [
        ["questionsPerFamily", "questions"],
        ["concurrency", "concurrency"],
        ["timeoutMs", "timeout-ms"],
        ["maxTokens", "max-tokens"],
    ]) {
        if (!Number.isSafeInteger(args[key]) || args[key] < 1)
            throw new Error(`--${flag} must be a positive integer`);
    }
    if (
        !Number.isFinite(args.maxCostPollen) ||
        args.maxCostPollen <= 0 ||
        args.maxCostPollen >= 20
    ) {
        throw new Error("--max-cost must be positive and below 20 Pollen");
    }
    if (
        args.seed !== null &&
        (!Number.isSafeInteger(args.seed) ||
            args.seed < 0 ||
            args.seed > 0xffffffff)
    ) {
        throw new Error("--seed must be an unsigned 32-bit integer");
    }
    if (args.models?.length === 0 || args.families.length === 0)
        throw new Error("Model/eval selections cannot be empty");
    args.families = [...new Set(args.families)];
    const url = new URL(args.baseUrl);
    if (
        url.protocol !== "https:" &&
        !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
        )
    )
        throw new Error("--base-url must use HTTPS");
    args.baseUrl = args.baseUrl.replace(/\/$/, "");
    return args;
}

function printHelp() {
    console.log(`Usage: node operations/model-evals/cli.mjs [options]

Scores every text model in /text/models against the AIW eval families.

Options:
  --models a,b,c        Score only these models (names or aliases)
  --only scope          Score only "community" or "official" models
  --evals families      Eval families to run (default: ${DEFAULT_OPTIONS.families.join(",")})
  --questions n         Questions per family (default ${DEFAULT_OPTIONS.questionsPerFamily})
  --concurrency n       Parallel in-flight requests (default ${DEFAULT_OPTIONS.concurrency})
  --timeout-ms n        Per-request timeout (default ${DEFAULT_OPTIONS.timeoutMs})
  --max-cost pollen     Reserve requests within this Pollen budget (default ${DEFAULT_OPTIONS.maxCostPollen})
  --max-tokens n        Completion token cap (default ${DEFAULT_OPTIONS.maxTokens})
  --seed n              Run seed for reproducible questions and request seeds
  --out file.json       Write the full run result as JSON
  --history file.json   Append the run to a capped history file
  --list                Print the model selection and questions, then exit
  --quiet               Only print the final summary`);
}

function percent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

async function writeJson(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function readHistory(path) {
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

function familyBreakdown(questionResults, families) {
    const breakdown = {};
    for (const family of families) {
        const results = questionResults.filter(
            (result) => result.family === family,
        );
        breakdown[family] = {
            correct: results.filter((result) => result.correct).length,
            total: results.length,
        };
    }
    return breakdown;
}

export async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help) {
        printHelp();
        return 0;
    }
    const log = args.quiet ? () => {} : (message) => console.log(message);

    const models = await fetchTextModels(args.baseUrl);
    const selected = selectModels(models, {
        names: args.models,
        scope: args.only,
    });
    log(
        `Scoring ${selected.length} of ${models.length} text models (${selected.filter((m) => m.community).length} community)`,
    );

    if (selected.length === 0)
        throw new Error("No text models matched the selection");

    const startedAt = new Date();
    const runSeed = args.seed ?? randomInt(0x100000000);
    const rng = createRng(runSeed);
    const questions = generateQuestionSet({
        families: args.families,
        questionsPerFamily: args.questionsPerFamily,
        rng,
    });

    if (args.list) {
        console.log(`Run seed: ${runSeed}`);
        console.log("\nModels:");
        for (const model of selected) {
            console.log(
                `  ${model.name}${model.community ? "  (community)" : ""}`,
            );
        }
        console.log("\nQuestions:");
        for (const question of questions) {
            console.log(
                `  [${familyTitle(question.family)}] ${question.prompt}`,
            );
            console.log(`    expected: ${question.answer}`);
        }
        return 0;
    }

    if (!args.apiKey) {
        console.error(
            "A Pollinations API key is required. Set POLLINATIONS_API_KEY or pass --api-key. Get one at https://enter.pollinations.ai/keys",
        );
        return 2;
    }

    const {
        totalCostPollen,
        entries,
        capReached,
        rateLimited,
        unknownCostRequests,
        costUpperBoundPollen,
    } = await runEval({
        models: selected,
        questions,
        costPollenOf: requestCostPollen,
        runSeed,
        options: {
            baseUrl: args.baseUrl,
            apiKey: args.apiKey,
            concurrency: args.concurrency,
            timeoutMs: args.timeoutMs,
            maxCostPollen: args.maxCostPollen,
            maxTokens: args.maxTokens,
        },
        log,
    });
    const finishedAt = new Date();

    const scored = entries
        .filter((entry) => entry.status === "scored")
        .map((entry) => {
            const summary = scoreModel(entry.questionResults);
            return {
                name: entry.model.name,
                publisher: entry.model.publisher ?? null,
                community: entry.model.community === true,
                aliases: entry.model.aliases ?? [],
                status: "scored",
                ...summary,
                questionResults: entry.questionResults,
                families: familyBreakdown(entry.questionResults, args.families),
            };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const overCap = entries
        .filter((entry) => entry.status === "over_cost_cap")
        .map((entry) => ({
            name: entry.model.name,
            community: entry.model.community === true,
        }));

    const incomplete = entries
        .filter((entry) => entry.status === "rate_limited")
        .map((entry) => ({
            name: entry.model.name,
            community: entry.model.community === true,
            status: entry.status,
            questionResults: entry.questionResults,
        }));
    const run = {
        schema: 1,
        runId: startedAt.toISOString().replace(/[:.]/g, "-"),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        runSeed,
        baseUrl: args.baseUrl,
        families: args.families,
        questionsPerFamily: args.questionsPerFamily,
        questionCount: questions.length,
        modelCount: selected.length,
        scoredCount: scored.length,
        costPollen: totalCostPollen,
        maxCostPollen: args.maxCostPollen,
        capReached,
        rateLimited,
        complete: !capReached && !rateLimited,
        unknownCostRequests,
        costUpperBoundPollen,
        costMethod:
            "catalog pricing times provider-reported usage; unknown charges reserved conservatively",
        questions,
        maxTokens: args.maxTokens,
        models: [
            ...scored,
            ...incomplete,
            ...overCap.map((m) => ({ ...m, status: "over_cost_cap" })),
        ],
    };

    console.log(`\n${"=".repeat(72)}`);
    console.log(
        `AIW eval — ${args.families.map(familyTitle).join(", ")} — ${scored.length} models scored`,
    );
    console.log(`Run ${run.runId}`);
    const nameWidth = Math.max(...scored.map((model) => model.name.length), 12);
    console.log(
        `${"MODEL".padEnd(nameWidth)}  SCORE    ±MoE    ANSWERED  ERRORS  COST`,
    );
    for (const model of scored) {
        console.log(
            `${model.name.padEnd(nameWidth)}  ${percent(model.score).padStart(6)}  ${(model.marginOfError * 100).toFixed(1).padStart(5)}%  ${`${model.correct}/${model.total}`.padStart(8)}  ${String(model.errors).padStart(6)}  ${model.costPollen.toFixed(3)}`,
        );
    }
    if (overCap.length > 0) {
        console.log(
            `\nNot scored (Pollen cost cap reached): ${overCap.map((m) => m.name).join(", ")}`,
        );
    }
    console.log(
        `\nTotal cost: ${totalCostPollen.toFixed(6)} Pollen of ${args.maxCostPollen} cap` +
            ` (${((finishedAt - startedAt) / 60000).toFixed(1)} min)`,
    );

    if (unknownCostRequests > 0)
        console.log(
            `Cost incomplete: ${unknownCostRequests} requests without usable billing usage; conservative accounted estimate ${costUpperBoundPollen.toFixed(6)} Pollen`,
        );
    if (rateLimited)
        console.error(
            "Run incomplete: account rate limit exhausted. No weekly leaderboard will be published.",
        );

    if (args.out) {
        await writeJson(args.out, run);
        console.log(`Results written to ${args.out}`);
    }
    if (args.history && run.complete) {
        const history = await readHistory(args.history);
        history.push({
            runId: run.runId,
            startedAt: run.startedAt,
            families: run.families,
            questionsPerFamily: run.questionsPerFamily,
            costPollen: run.costPollen,
            scoredCount: run.scoredCount,
            models: scored.map((model) => ({
                name: model.name,
                community: model.community,
                score: model.score,
                marginOfError: model.marginOfError,
                answered: model.total,
                correct: model.correct,
            })),
        });
        await writeJson(args.history, history.slice(-HISTORY_RUN_LIMIT));
        console.log(`History updated: ${args.history}`);
    }
    return rateLimited ? 2 : capReached ? 3 : 0;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(error.message ?? error);
            process.exitCode = 1;
        });
}
