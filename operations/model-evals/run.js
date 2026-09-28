#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { EVALS } from "./evals/index.js";
import {
    ask,
    defaultBaseUrl,
    estimateCost,
    fetchBalance,
    fetchTextModels,
} from "./lib/gen.js";
import { createRng } from "./lib/rng.js";
import { scoreOf } from "./lib/stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const USAGE = `Score every text model on gen.pollinations.ai with the same eval questions.

  POLLINATIONS_API_KEY=sk_... node operations/model-evals/run.js [options]

  --scope all|official|community   which models to score (default all)
  --models a,b,c                   only these names or aliases (overrides --scope)
  --eval id                        only this eval (default: all of ${EVALS.map((e) => e.id).join(", ")})
  --samples N                      questions per family and model (default 10)
  --budget N                       stop asking questions once this many Pollen are spent (default 12)
  --concurrency N                  models scored at once (default 8)
  --timeout SECONDS                per-question time limit, a timeout counts as a failed answer (default 180)
  --seed N                         question seed (default: random; printed and saved)
  --out DIR                        results directory (default: operations/model-evals/data)
  --dry-run                        print the questions and models, call nothing
`;

const unitPrice = (model) =>
    Number(model.pricing?.promptTextTokens ?? 0) * 200 +
    Number(model.pricing?.completionTextTokens ?? 0) * 600;

/** Models to score: by name/alias if given, else by scope. Cheapest first. */
export function selectModels(catalog, { models, scope = "all" }) {
    let selected = catalog;
    if (models?.length) {
        const wanted = models.map((name) => name.toLowerCase());
        selected = catalog.filter((model) =>
            [model.name, ...(model.aliases ?? [])].some((name) =>
                wanted.includes(name.toLowerCase()),
            ),
        );
        const unknown = wanted.filter(
            (name) =>
                !selected.some((model) =>
                    [model.name, ...(model.aliases ?? [])].some(
                        (candidate) => candidate.toLowerCase() === name,
                    ),
                ),
        );
        if (unknown.length) {
            throw new Error(`Unknown model(s): ${unknown.join(", ")}`);
        }
    } else if (scope !== "all") {
        selected = catalog.filter(
            (model) => Boolean(model.community) === (scope === "community"),
        );
    }
    return [...selected].sort((a, b) => unitPrice(a) - unitPrice(b));
}

const inPool = async (items, size, work) => {
    const queue = [...items];
    await Promise.all(
        Array.from({ length: Math.min(size, queue.length) }, async () => {
            while (queue.length) await work(queue.shift());
        }),
    );
};

async function scoreModel({
    model,
    evalDef,
    questions,
    seed,
    api,
    onCost,
    overBudget,
}) {
    const families = Object.fromEntries(
        evalDef.families.map((family) => [family, { correct: 0, total: 0 }]),
    );
    const errors = {};
    let cost = 0;
    let stopped = false;
    await inPool(questions.entries(), 4, async ([index, question]) => {
        if (overBudget()) {
            stopped = true;
            return;
        }
        const reply = await ask({
            ...api,
            model: model.name,
            prompt: question.prompt,
            seed: (seed + index) % 2147483647,
        });
        const spent = estimateCost(reply.usage, model.pricing);
        cost += spent;
        onCost(spent);
        const family = families[question.family];
        family.total++;
        if (reply.error) errors[reply.error] = (errors[reply.error] ?? 0) + 1;
        else if (evalDef.grade(reply.text, question)) family.correct++;
    });
    // A model the budget cut off mid-way is not scored on the questions it did get.
    if (stopped) return { status: "skipped", cost };
    const correct = Object.values(families).reduce((n, f) => n + f.correct, 0);
    const failed = Object.values(errors).reduce((n, count) => n + count, 0);
    return {
        status: "scored",
        questions: questions.length,
        correct,
        failed,
        ...scoreOf(correct, questions.length),
        families,
        errors,
        cost,
    };
}

/**
 * Score `models` on every eval. Models start cheapest first; once the
 * estimated spend reaches `budget` no further question is sent and the models
 * still unfinished are reported as skipped, so a run never overshoots the
 * budget by more than the requests already in flight.
 * An error or timeout counts as a wrong answer, never as a skipped question.
 */
export async function runEvals({
    models,
    evals = EVALS,
    samples,
    seed,
    budget,
    concurrency,
    api,
    log = () => {},
}) {
    const questionSets = evals.map((evalDef) =>
        evalDef.questions({ rng: createRng(seed), samples }),
    );
    let spent = 0;
    const results = evals.map((evalDef) => ({
        id: evalDef.id,
        title: evalDef.title,
        source: evalDef.source,
        families: evalDef.families,
        models: [],
    }));

    await inPool(models, concurrency, async (model) => {
        const identity = {
            name: model.name,
            community: Boolean(model.community),
            aliases: model.aliases ?? [],
        };
        for (const [i, evalDef] of evals.entries()) {
            const entry =
                spent >= budget
                    ? { status: "skipped" }
                    : await scoreModel({
                          model,
                          evalDef,
                          questions: questionSets[i],
                          seed,
                          api,
                          onCost: (amount) => {
                              spent += amount;
                          },
                          overBudget: () => spent >= budget,
                      });
            results[i].models.push({ ...identity, ...entry });
            log(model.name, evalDef.id, entry);
        }
    });
    return { results, estimatedCost: spent };
}

const percent = (value) => `${(value * 100).toFixed(0)}%`;

export function formatTable(evalResult) {
    const rows = evalResult.models
        .filter((model) => model.status === "scored")
        .sort((a, b) => b.rate - a.rate || a.cost - b.cost);
    const width = Math.max(5, ...rows.map((row) => row.name.length));
    const lines = [
        `${evalResult.title}: ${rows.length} scored, ${evalResult.models.length - rows.length} skipped`,
        `${"model".padEnd(width)}  score       failed  cost (Pollen)`,
    ];
    for (const row of rows) {
        lines.push(
            `${row.name.padEnd(width)}  ${`${percent(row.rate)} ±${percent(row.moe)}`.padEnd(10)}  ${String(row.failed).padStart(6)}  ${row.cost.toFixed(4)}`,
        );
    }
    return lines.join("\n");
}

function saveRun(outDir, run) {
    mkdirSync(join(outDir, "runs"), { recursive: true });
    writeFileSync(
        join(outDir, "runs", `${run.id}.json`),
        `${JSON.stringify(run)}\n`,
    );
    const indexPath = join(outDir, "index.json");
    const index = existsSync(indexPath)
        ? JSON.parse(readFileSync(indexPath, "utf-8"))
        : { runs: [] };
    index.runs = [
        {
            id: run.id,
            date: run.date,
            cost: run.cost.balanceChange ?? run.cost.estimated,
            evals: run.evals.map((entry) => entry.id),
            scored: run.evals[0].models.filter((m) => m.status === "scored")
                .length,
        },
        ...index.runs.filter((entry) => entry.id !== run.id),
    ];
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
    const { values: opts } = parseArgs({
        args: argv,
        options: {
            scope: { type: "string", default: "all" },
            models: { type: "string" },
            eval: { type: "string" },
            samples: { type: "string", default: "10" },
            budget: { type: "string", default: "12" },
            concurrency: { type: "string", default: "8" },
            timeout: { type: "string", default: "180" },
            seed: { type: "string" },
            out: { type: "string", default: join(HERE, "data") },
            "dry-run": { type: "boolean", default: false },
            help: { type: "boolean", default: false },
        },
    });
    if (opts.help) return console.log(USAGE);

    const key = env.POLLINATIONS_API_KEY;
    const baseUrl = defaultBaseUrl();
    const evals = opts.eval ? EVALS.filter((e) => e.id === opts.eval) : EVALS;
    if (evals.length === 0) throw new Error(`Unknown eval: ${opts.eval}`);
    const seed = Number(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    const samples = Number(opts.samples);

    const models = selectModels(await fetchTextModels({ baseUrl, key }), {
        models: opts.models?.split(",").map((name) => name.trim()),
        scope: opts.scope,
    });
    console.log(
        `Seed ${seed}: ${models.length} models x ${evals.map((e) => `${e.id} (${e.families.length * samples} questions)`).join(", ")}`,
    );
    if (opts["dry-run"]) {
        for (const evalDef of evals) {
            for (const q of evalDef.questions({
                rng: createRng(seed),
                samples: 1,
            })) {
                console.log(`\n[${q.family}] answer ${q.answer}\n${q.prompt}`);
            }
        }
        return console.log(`\nModels: ${models.map((m) => m.name).join(", ")}`);
    }
    if (!key) throw new Error("Set POLLINATIONS_API_KEY.");

    const api = { baseUrl, key, timeoutMs: Number(opts.timeout) * 1000 };
    const balanceBefore = await fetchBalance(api);
    const startedAt = new Date();
    const { results, estimatedCost } = await runEvals({
        models,
        evals,
        samples,
        seed,
        budget: Number(opts.budget),
        concurrency: Number(opts.concurrency),
        api,
        log: (name, evalId, entry) =>
            console.error(
                `${entry.status === "scored" ? `${percent(entry.rate)} (${entry.failed} failed)` : "skipped"}  ${name}  [${evalId}]`,
            ),
    });
    const balanceAfter = await fetchBalance(api);
    const balanceChange =
        balanceBefore !== null && balanceAfter !== null
            ? Number((balanceBefore - balanceAfter).toFixed(6))
            : null;

    const run = {
        version: 1,
        id: startedAt.toISOString().replace(/[:.]/g, "-"),
        date: startedAt.toISOString(),
        seed,
        samples,
        cost: { estimated: Number(estimatedCost.toFixed(6)), balanceChange },
        evals: results,
    };
    saveRun(opts.out, run);

    for (const evalResult of results)
        console.log(`\n${formatTable(evalResult)}`);
    console.log(
        `\nCost: ${estimatedCost.toFixed(4)} Pollen estimated from reported usage and catalog prices${balanceChange === null ? "" : `; account balance changed by ${balanceChange} Pollen`}.`,
    );
    console.log(`Saved ${join(opts.out, "runs", `${run.id}.json`)}`);
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
