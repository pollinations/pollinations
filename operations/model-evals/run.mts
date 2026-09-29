/**
 * Score every text model on gen.pollinations.ai against an eval.
 *
 * Usage:
 *   POLLINATIONS_API_KEY=... node operations/model-evals/run.mts
 *   POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --filter community --questions 3
 *   POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --models openai/gpt-6-luna,community/Saauf/gpt-6-luna
 *   POLLINATIONS_API_KEY=... node operations/model-evals/run.mts --dry-run
 *
 * The key is read from the environment only, never from a flag, so it cannot end
 * up in shell history or in a workflow log.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_EVAL_ID, findEval, listEvalIds } from "./evals/index.mts";
import {
    DEFAULT_BASE_URL,
    estimateModelCost,
    estimateTokens,
    type FetchLike,
    fetchTextModels,
    type RunFilter,
    selectModels,
} from "./src/catalog.mts";
import {
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_TIMEOUT_MS,
    fetchAccountBalance,
} from "./src/client.mts";
import {
    appendHistory,
    buildHistoryEntry,
    buildReport,
    type HistoryFile,
    type RunReport,
    renderLeaderboard,
} from "./src/report.mts";
import {
    DEFAULT_BUDGET_POLLEN,
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_COST_PER_MODEL,
    DEFAULT_MAX_TOKENS,
    DEFAULT_QUESTIONS_PER_FAMILY,
    runEval,
} from "./src/runner.mts";

export const USAGE = `Usage: node operations/model-evals/run.mts [options]

Options:
  --eval <id>                Eval to run (default: ${DEFAULT_EVAL_ID}; available: ${listEvalIds().join(", ")})
  --filter <all|official|community>  Which half of the catalog to score (default: all)
  --models <a,b>             Score only these models (name, alias or short name)
  --questions <n>            Questions per family (default: ${DEFAULT_QUESTIONS_PER_FAMILY})
  --seed <n>                 Run seed; the same seed regenerates the same quiz
  --concurrency <n>          Models scored in parallel (default: ${DEFAULT_CONCURRENCY})
  --timeout-ms <n>           Per-request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --max-attempts <n>         Attempts per request, retrying 429 and 5xx (default: ${DEFAULT_MAX_ATTEMPTS})
  --max-tokens <n>           Output cap sent to models that accept one (default: ${DEFAULT_MAX_TOKENS})
  --pollen-budget <n>        Spend ceiling for the whole run; 0 disables it (default: ${DEFAULT_BUDGET_POLLEN})
  --max-cost-per-model <n>   Spend ceiling per model (default: ${DEFAULT_MAX_COST_PER_MODEL})
  --out <dir>                Write latest.json, history.json and leaderboard.txt into <dir>
  --json                     Print the report JSON instead of the leaderboard
  --dry-run                  List the models and the estimated cost, send nothing
  --balance                  Print the account balance and exit
  --help                     Show this message

Environment:
  POLLINATIONS_API_KEY       Required, except with --help
  POLLINATIONS_BASE_URL      Override the gen API host (default: ${DEFAULT_BASE_URL})`;

export type CliOptions = {
    evalId: string;
    filter: RunFilter;
    models: string[] | null;
    questions: number;
    seed: number | null;
    concurrency: number;
    timeoutMs: number;
    maxAttempts: number;
    maxTokens: number;
    pollenBudget: number;
    maxCostPerModel: number;
    out: string | null;
    json: boolean;
    dryRun: boolean;
    balance: boolean;
    help: boolean;
};

export const DEFAULT_CLI_OPTIONS: CliOptions = {
    evalId: DEFAULT_EVAL_ID,
    filter: "all",
    models: null,
    questions: DEFAULT_QUESTIONS_PER_FAMILY,
    seed: null,
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    maxTokens: DEFAULT_MAX_TOKENS,
    pollenBudget: DEFAULT_BUDGET_POLLEN,
    maxCostPerModel: DEFAULT_MAX_COST_PER_MODEL,
    out: null,
    json: false,
    dryRun: false,
    balance: false,
    help: false,
};

const NUMBER_FLAGS: Record<string, keyof CliOptions> = {
    "--questions": "questions",
    "--seed": "seed",
    "--concurrency": "concurrency",
    "--timeout-ms": "timeoutMs",
    "--max-attempts": "maxAttempts",
    "--max-tokens": "maxTokens",
    "--pollen-budget": "pollenBudget",
    "--max-cost-per-model": "maxCostPerModel",
};

const VALUE_FLAGS = new Set([
    "--eval",
    "--filter",
    "--models",
    "--out",
    ...Object.keys(NUMBER_FLAGS),
]);

function parsePositiveNumber(
    flag: string,
    raw: string,
    allowZero = false,
): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
        throw new Error(
            `${flag} expects a ${allowZero ? "non-negative" : "positive"} number, got "${raw}"\n${USAGE}`,
        );
    }
    return value;
}

export function parseArgs(argv: readonly string[]): CliOptions {
    const options: CliOptions = { ...DEFAULT_CLI_OPTIONS };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === "--help" || flag === "-h") {
            options.help = true;
            continue;
        }
        if (flag === "--json") {
            options.json = true;
            continue;
        }
        if (flag === "--dry-run") {
            options.dryRun = true;
            continue;
        }
        if (flag === "--balance") {
            options.balance = true;
            continue;
        }
        if (!VALUE_FLAGS.has(flag)) {
            throw new Error(`Unknown argument: ${flag}\n${USAGE}`);
        }
        const raw = argv[index + 1];
        if (raw === undefined || raw.startsWith("--")) {
            throw new Error(`${flag} needs a value\n${USAGE}`);
        }
        index += 1;
        const numericKey = NUMBER_FLAGS[flag];
        if (numericKey) {
            const value = parsePositiveNumber(
                flag,
                raw,
                flag === "--pollen-budget" || flag === "--seed",
            );
            if (numericKey === "seed") {
                options.seed = Math.trunc(value);
            } else if (numericKey === "questions") {
                options.questions = Math.trunc(value);
            } else if (numericKey === "concurrency") {
                options.concurrency = Math.trunc(value);
            } else if (numericKey === "maxAttempts") {
                options.maxAttempts = Math.trunc(value);
            } else if (numericKey === "maxTokens") {
                options.maxTokens = Math.trunc(value);
            } else if (numericKey === "timeoutMs") {
                options.timeoutMs = Math.trunc(value);
            } else if (numericKey === "pollenBudget") {
                options.pollenBudget = value;
            } else if (numericKey === "maxCostPerModel") {
                options.maxCostPerModel = value;
            } else {
                throw new Error(`Unhandled numeric flag: ${flag}`);
            }
            continue;
        }
        if (flag === "--eval") {
            options.evalId = raw;
        } else if (flag === "--filter") {
            if (raw !== "all" && raw !== "official" && raw !== "community") {
                throw new Error(
                    `--filter expects all, official or community, got "${raw}"\n${USAGE}`,
                );
            }
            options.filter = raw;
        } else if (flag === "--models") {
            options.models = raw
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean);
        } else {
            options.out = raw;
        }
    }
    if (options.questions < 1 || options.questions > 20) {
        throw new Error(
            `--questions must be between 1 and 20, got ${options.questions}\n${USAGE}`,
        );
    }
    return options;
}

export type RunSummary = {
    report: RunReport;
    latestPath: string | null;
    historyPath: string | null;
};

export async function writeReportFiles(
    outDir: string,
    report: RunReport,
): Promise<{
    latestPath: string;
    historyPath: string;
    leaderboardPath: string;
}> {
    await mkdir(outDir, { recursive: true });
    const latestPath = join(outDir, "latest.json");
    const historyPath = join(outDir, "history.json");
    const leaderboardPath = join(outDir, "leaderboard.txt");
    await writeFile(leaderboardPath, `${renderLeaderboard(report)}\n`, "utf8");
    await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    let history: HistoryFile | null = null;
    try {
        history = JSON.parse(
            await readFile(historyPath, "utf8"),
        ) as HistoryFile;
    } catch {
        history = null;
    }
    const next = appendHistory(history, buildHistoryEntry(report), {
        updatedAt: report.run.generatedAt,
    });
    await writeFile(historyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return { latestPath, historyPath, leaderboardPath };
}

/** Injection seams used by the tests; production callers pass nothing. */
export type MainDeps = {
    fetchImpl?: FetchLike;
};

export async function main(
    argv: readonly string[],
    env: Record<string, string | undefined> = process.env,
    deps: MainDeps = {},
): Promise<number> {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(USAGE);
        return 0;
    }

    const apiKey = env.POLLINATIONS_API_KEY ?? "";
    const baseUrl = env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL;
    if (!apiKey) {
        console.error("POLLINATIONS_API_KEY is required.");
        return 1;
    }

    if (options.balance) {
        const balance = await fetchAccountBalance({
            apiKey,
            baseUrl,
            fetchImpl: deps.fetchImpl,
        });
        if (balance === null) {
            console.error("Could not read the account balance.");
            return 1;
        }
        console.log(`${balance.toFixed(6)} pollen`);
        return 0;
    }

    const evalDefinition = findEval(options.evalId);
    const seed = options.seed ?? Date.now();
    const catalog = await fetchTextModels({
        baseUrl,
        apiKey,
        fetchImpl: deps.fetchImpl,
    });
    const models = selectModels(catalog, {
        filter: options.filter,
        names: options.models ?? [],
    });
    if (models.length === 0) {
        console.error("No model matched the selection.");
        return 1;
    }
    const questions = evalDefinition.questions({
        seed,
        perFamily: options.questions,
    });
    const promptTokens = questions.reduce(
        (max, question) => Math.max(max, estimateTokens(question.prompt)),
        0,
    );

    if (options.dryRun) {
        const estimates = models.map((model) => ({
            model,
            cost: estimateModelCost(model, {
                promptTokens,
                maxOutputTokens: options.maxTokens,
                questions: questions.length,
            }),
        }));
        const total = estimates.reduce((sum, entry) => sum + entry.cost, 0);
        console.log(
            `${models.length} models × ${questions.length} questions = ${models.length * questions.length} graded questions · seed ${seed} · eval ${evalDefinition.id}`,
        );
        console.log(
            `Estimated worst-case cost ${total.toFixed(6)} pollen of a ${options.pollenBudget} pollen budget (models with no published price count as free):`,
        );
        for (const entry of [...estimates].sort((a, b) => b.cost - a.cost)) {
            console.log(
                `  ${entry.cost.toFixed(6)}  ${entry.model.name}${entry.model.community ? " (community)" : ""}`,
            );
        }
        return 0;
    }

    const startedAt = Date.now();
    const result = await runEval({
        evalDefinition,
        models,
        apiKey,
        baseUrl,
        questionsPerFamily: options.questions,
        seed,
        concurrency: options.concurrency,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
        maxTokens: options.maxTokens,
        pollenBudget: options.pollenBudget,
        maxCostPerModel: options.maxCostPerModel,
        fetchImpl: deps.fetchImpl,
        log: options.json ? undefined : (message) => console.log(message),
        onModelDone: options.json
            ? undefined
            : (model) => {
                  console.log(
                      `  ${model.name}: ${model.score.correct}/${model.score.asked} (±${(model.score.marginOfError * 100).toFixed(1)}%) in ${(model.avgLatencyMs / 1000).toFixed(1)}s · ${model.costPollen.toFixed(6)} pollen`,
                  );
              },
    });

    const report = buildReport(result, { baseUrl });
    const paths = options.out
        ? await writeReportFiles(options.out, report)
        : null;
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log("");
        console.log(renderLeaderboard(report));
        if (paths) {
            console.log("");
            console.log(`Wrote ${paths.latestPath} and ${paths.historyPath}`);
        }
    }
    if (!options.json) {
        console.log(
            `Run wall clock: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        );
    }
    return 0;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            console.error(
                error instanceof Error ? error.message : String(error),
            );
            process.exitCode = 1;
        });
}
