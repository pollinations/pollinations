import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    DEFAULT_CLI_OPTIONS,
    main,
    parseArgs,
    writeReportFiles,
} from "./run.mts";
import {
    appendHistory,
    buildHistoryEntry,
    buildReport,
} from "./src/report.mts";
import { scoreFor } from "./src/stats.mts";
import {
    COST_PER_QUESTION,
    createFakeServer,
    modelFixture,
} from "./test-helpers.mts";

const CATALOG = [
    {
        name: "openai/gpt-6-luna",
        aliases: ["gpt-6", "luna"],
        title: "GPT-6 Luna",
        publisher: "OpenAI",
        category: "text",
        health: { status: "healthy" },
        pricing: { promptTextTokens: 1e-6, completionTextTokens: 4e-6 },
        supported_parameters: ["seed", "max_tokens"],
    },
    {
        name: "community/Saauf/gpt-6-luna",
        title: "GPT-6 Luna (community)",
        community: true,
        category: "text",
        health: { status: "degraded" },
        pricing: { promptTextTokens: 1e-6, completionTextTokens: 4e-6 },
        supported_parameters: ["seed"],
    },
    { name: "pollinations/midijourney", category: "image" },
];

async function capture(
    run: () => Promise<number>,
): Promise<{ code: number; out: string[]; err: string[] }> {
    const out: string[] = [];
    const err: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
        out.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
        err.push(args.map(String).join(" "));
    };
    try {
        const code = await run();
        return { code, out, err };
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
}

async function tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), "model-evals-"));
}

test("parseArgs defaults to a full weekly run", () => {
    assert.deepEqual(parseArgs([]), DEFAULT_CLI_OPTIONS);
    assert.equal(DEFAULT_CLI_OPTIONS.evalId, "aiw");
    assert.equal(DEFAULT_CLI_OPTIONS.filter, "all");
    assert.equal(DEFAULT_CLI_OPTIONS.pollenBudget, 20);
});

test("parseArgs reads every documented flag", () => {
    const options = parseArgs([
        "--eval",
        "aiw",
        "--filter",
        "community",
        "--models",
        "openai/gpt-6-luna, community/Saauf/gpt-6-luna",
        "--questions",
        "2",
        "--seed",
        "0",
        "--concurrency",
        "3",
        "--timeout-ms",
        "1000",
        "--max-attempts",
        "1",
        "--max-tokens",
        "128",
        "--pollen-budget",
        "0",
        "--max-cost-per-model",
        "0.5",
        "--out",
        "dist",
        "--json",
        "--dry-run",
        "--balance",
    ]);
    assert.equal(options.help, false);
    assert.equal(options.filter, "community");
    assert.deepEqual(options.models, [
        "openai/gpt-6-luna",
        "community/Saauf/gpt-6-luna",
    ]);
    assert.equal(options.questions, 2);
    assert.equal(options.seed, 0);
    assert.equal(options.concurrency, 3);
    assert.equal(options.timeoutMs, 1000);
    assert.equal(options.maxAttempts, 1);
    assert.equal(options.maxTokens, 128);
    assert.equal(options.pollenBudget, 0);
    assert.equal(options.maxCostPerModel, 0.5);
    assert.equal(options.out, "dist");
    assert.equal(options.json, true);
    assert.equal(options.dryRun, true);
    assert.equal(options.balance, true);
});

test("parseArgs rejects bad input instead of guessing", () => {
    assert.equal(parseArgs(["--help"]).help, true);
    assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
    assert.throws(() => parseArgs(["--questions"]), /needs a value/);
    assert.throws(() => parseArgs(["--questions", "0"]), /positive number/);
    assert.throws(() => parseArgs(["--questions", "21"]), /between 1 and 20/);
    assert.throws(
        () => parseArgs(["--filter", "half"]),
        /all, official or community/,
    );
    assert.throws(
        () => parseArgs(["--max-cost-per-model", "-1"]),
        /positive number/,
    );
});

test("writeReportFiles writes latest.json and merges history.json", async () => {
    const dir = await tempDir();
    const first = buildReport(
        {
            evalDefinition: {
                id: "aiw",
                title: "Alice in Wonderland",
                description: "d",
                version: 1,
                source: "s",
                families: ["aiw"],
                questions: () => [],
                grade: () => ({ ok: false, answer: null, formatted: false }),
            },
            questions: [],
            models: [],
            notRun: [],
            costPollen: 0.001,
            costUnknownModels: [],
            balanceBefore: 1,
            balanceAfter: 0.999,
            seed: 1,
            questionsPerFamily: 1,
            concurrency: 1,
            budgetPollen: 20,
            maxCostPerModel: 1,
            maxTokens: 100,
            timeoutMs: 1000,
            startedAt: "2026-09-29T06:00:00.000Z",
            durationSec: 1,
        },
        { generatedAt: "2026-09-29T06:00:01.000Z" },
    );
    const paths = await writeReportFiles(dir, first);
    assert.deepEqual((await readdir(dir)).sort(), [
        "history.json",
        "latest.json",
        "leaderboard.txt",
    ]);
    const latest = JSON.parse(await readFile(paths.latestPath, "utf8")) as {
        schema: number;
    };
    assert.equal(latest.schema, 1);
    let history = JSON.parse(await readFile(paths.historyPath, "utf8")) as {
        runs: unknown[];
    };
    assert.equal(history.runs.length, 1);

    const second = {
        ...first,
        run: {
            ...first.run,
            id: "2026-10-06T06:00:00.000Z",
            startedAt: "2026-10-06T06:00:00.000Z",
        },
    };
    await writeReportFiles(dir, second);
    history = JSON.parse(await readFile(paths.historyPath, "utf8")) as {
        runs: { id: string }[];
    };
    assert.deepEqual(
        history.runs.map((entry) => entry.id),
        ["2026-10-06T06:00:00.000Z", "2026-09-29T06:00:00.000Z"],
    );

    // And the merge helper is idempotent for a repeated run id.
    const merged = appendHistory(history as never, buildHistoryEntry(second), {
        updatedAt: "x",
    });
    assert.equal(
        merged.runs.filter((entry) => entry.id === second.run.id).length,
        1,
    );
});

test("main refuses to run without a key", async () => {
    const { code, err } = await capture(() => main([], {}));
    assert.equal(code, 1);
    assert.match(err.join("\n"), /POLLINATIONS_API_KEY is required/);
});

test("main --help explains the options", async () => {
    const { code, out } = await capture(() => main(["--help"], {}));
    assert.equal(code, 0);
    assert.match(out.join("\n"), /--pollen-budget/);
    assert.match(out.join("\n"), /POLLINATIONS_API_KEY/);
});

test("main --balance prints the billing balance", async () => {
    const server = createFakeServer({
        balances: [86.81695288],
        catalog: CATALOG,
    });
    const { code, out } = await capture(() =>
        main(
            ["--balance"],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 0);
    assert.equal(out.join("\n").trim(), "86.816953 pollen");
});

test("main --dry-run lists the plan without spending anything", async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = createFakeServer({ catalog: CATALOG, bodies });
    const { code, out } = await capture(() =>
        main(
            ["--dry-run", "--questions", "1"],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 0);
    const text = out.join("\n");
    assert.match(text, /2 models × 3 questions = 6 graded questions/);
    assert.match(text, /Estimated worst-case cost/);
    assert.match(text, /openai\/gpt-6-luna/);
    assert.equal(bodies.length, 0);
});

test("main runs the eval, prints the leaderboard and writes the report files", async () => {
    const dir = await tempDir();
    const bodies: Record<string, unknown>[] = [];
    const server = createFakeServer({
        catalog: CATALOG,
        bodies,
        balances: [86.81695288, 86.8169],
    });
    const { code, out } = await capture(() =>
        main(
            [
                "--models",
                "openai/gpt-6-luna",
                "--questions",
                "1",
                "--seed",
                "5",
                "--out",
                dir,
            ],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 0);
    const text = out.join("\n");
    assert.match(text, /# Model evals — Alice in Wonderland \(aiw\)/);
    assert.match(text, /1\/1 models/);
    assert.match(text, /Wrote .*latest\.json/);

    const latest = JSON.parse(
        await readFile(join(dir, "latest.json"), "utf8"),
    ) as {
        schema: number;
        run: {
            seed: number;
            costPollen: number;
            balanceBefore: number;
            balanceAfter: number;
            timeoutMs: number;
        };
        ranking: {
            name: string;
            score: number;
            asked: number;
            costPollen: number;
        }[];
    };
    assert.equal(latest.schema, 1);
    assert.equal(latest.run.seed, 5);
    assert.equal(latest.run.balanceBefore, 86.81695288);
    assert.equal(latest.run.balanceAfter, 86.8169);
    assert.equal(latest.run.timeoutMs, 90000);
    assert.equal(latest.ranking.length, 1);
    assert.equal(latest.ranking[0].name, "openai/gpt-6-luna");
    assert.equal(latest.ranking[0].score, 1);
    assert.equal(latest.ranking[0].asked, 3);
    assert.ok(Math.abs(latest.run.costPollen - 3 * COST_PER_QUESTION) < 1e-12);
    assert.equal(bodies.length, 3);
});

test("main --json prints only the report", async () => {
    const dir = await tempDir();
    const server = createFakeServer({ catalog: CATALOG });
    const { code, out } = await capture(() =>
        main(
            [
                "--models",
                "gpt-6-luna",
                "--questions",
                "1",
                "--seed",
                "8",
                "--json",
            ],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 0);
    const report = JSON.parse(out.join("\n")) as {
        schema: number;
        ranking: { name: string }[];
        pairs: unknown[];
    };
    assert.equal(report.schema, 1);
    assert.deepEqual(report.ranking.map((row) => row.name).sort(), [
        "community/Saauf/gpt-6-luna",
        "openai/gpt-6-luna",
    ]);
    assert.equal(report.pairs.length, 1);
    assert.equal(dir.length > 0, true);
});

test("main fails cleanly when no model matches", async () => {
    const server = createFakeServer({ catalog: CATALOG });
    const { code, err } = await capture(() =>
        main(
            ["--models", "does-not-exist"],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 1);
    assert.match(err.join("\n"), /No model matched/);
});

test("main surfaces an unknown eval id", async () => {
    const server = createFakeServer({ catalog: CATALOG });
    await assert.rejects(
        () =>
            main(
                ["--eval", "nope"],
                { POLLINATIONS_API_KEY: "k" },
                { fetchImpl: server },
            ),
        /Unknown eval/,
    );
});

test("main honours the community filter", async () => {
    const dir = await tempDir();
    const server = createFakeServer({ catalog: CATALOG });
    const { code } = await capture(() =>
        main(
            [
                "--filter",
                "community",
                "--questions",
                "1",
                "--seed",
                "3",
                "--out",
                dir,
            ],
            { POLLINATIONS_API_KEY: "k" },
            { fetchImpl: server },
        ),
    );
    assert.equal(code, 0);
    const latest = JSON.parse(
        await readFile(join(dir, "latest.json"), "utf8"),
    ) as {
        ranking: { name: string; scope: string }[];
    };
    assert.deepEqual(
        latest.ranking.map((row) => row.scope),
        ["community"],
    );
});

test("a run with a scoring model result keeps the report consistent", () => {
    // Guards the fixture the workflow asserts on: a model that answered everything.
    const result = modelFixture("openai/gpt-6-luna");
    assert.equal(result.name, "openai/gpt-6-luna");
    assert.equal(scoreFor(3, 3).score, 1);
});
