import assert from "node:assert/strict";
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
    buildReference,
    compareCells,
    compareWithReference,
    formatReport,
    MIN_REPETITIONS,
    main,
    overlap,
    PROBES,
    readAnswer,
} from "./fingerprint.js";
import { createRng } from "./lib/rng.js";

const probe = (id) => PROBES.find((p) => p.id === id);

describe("readAnswer", () => {
    const animal = probe("animal");

    test("accepts plain and lightly formatted valid answers", () => {
        for (const text of ["cat", "Cat.", "**cat**", "Answer: cat", ' "cat" '])
            assert.deepEqual(readAnswer(text, "stop", animal), {
                answer: "cat",
            });
        assert.deepEqual(readAnswer("42", "stop", probe("number")), {
            answer: "42",
        });
        assert.deepEqual(readAnswer("Q", null, probe("letter")), {
            answer: "q",
        });
    });

    test("strips closed reasoning wrappers before reading the answer", () => {
        for (const text of [
            "<think>The user wants an animal. Cats are common.</think>cat",
            "<thinking>\nhmm\n</thinking>\n\nCat",
            "<reasoning>a</reasoning><THINK>b</THINK> cat",
            "◁think▷pick one◁/think▷cat",
        ])
            assert.deepEqual(readAnswer(text, "stop", animal), {
                answer: "cat",
            });
    });

    test("rejects empty, truncated and malformed answers", () => {
        assert.deepEqual(readAnswer("", "stop", animal), { error: "empty" });
        assert.deepEqual(
            readAnswer("<think>only thoughts</think>", "stop", animal),
            {
                error: "empty",
            },
        );
        assert.deepEqual(readAnswer("cat", "length", animal), {
            error: "truncated",
        });
        assert.deepEqual(readAnswer("<think>still going", "stop", animal), {
            error: "truncated",
        });
        for (const text of ["I would pick a cat", "cat, dog", "🐱", "cat\ndog"])
            assert.deepEqual(readAnswer(text, "stop", animal), {
                error: "invalid",
            });
        for (const text of ["0", "101", "seven", "7.5"])
            assert.deepEqual(readAnswer(text, "stop", probe("number")), {
                error: "invalid",
            });
        assert.deepEqual(readAnswer("ab", "stop", probe("letter")), {
            error: "invalid",
        });
    });
});

describe("comparison", () => {
    const cell = (answers, errors = {}) => ({ answers, errors });
    const cellsOf = (make) =>
        Object.fromEntries(PROBES.map((p) => [p.id, make(p)]));

    test("overlap is 1 for the same answer mix and 0 for disjoint ones", () => {
        assert.equal(overlap({ a: 4, b: 4 }, { a: 2, b: 2 }), 1);
        assert.equal(overlap({ a: 8 }, { b: 8 }), 0);
        assert.equal(overlap({ a: 6, b: 2 }, { a: 2, b: 6 }), 0.5);
        assert.equal(overlap({}, { a: 1 }), 0);
    });

    test("cells with mostly unusable answers do not count towards a verdict", () => {
        const reference = { cells: cellsOf(() => cell({ cat: 8 })) };
        const halfBroken = cellsOf((p) =>
            ["animal", "colour", "number"].includes(p.id)
                ? cell({ cat: 3 }, { invalid: 5 })
                : cell({ cat: 8 }),
        );
        const result = compareCells(reference, halfBroken);
        assert.equal(result.usableCells, 5);
        assert.equal(result.verdict, "inconclusive");
        assert.deepEqual(result.cells.animal, { usable: false });

        const allGood = compareCells(
            reference,
            cellsOf(() => cell({ cat: 5 }, { truncated: 3 })),
        );
        assert.equal(allGood.usableCells, PROBES.length);
        assert.equal(allGood.verdict, "match");
        assert.equal(allGood.divergence, 0);
    });
});

// Two fake model families with their own favourite answers per probe.
const FAVOURITES = {
    animal: [
        ["cat", "dog"],
        ["owl", "fox"],
    ],
    colour: [
        ["blue", "green"],
        ["red", "teal"],
    ],
    number: [
        ["7", "42"],
        ["17", "73"],
    ],
    letter: [
        ["e", "a"],
        ["q", "z"],
    ],
    fruit: [
        ["apple", "mango"],
        ["kiwi", "plum"],
    ],
    "robot-name": [
        ["bolt", "pixel"],
        ["robo", "zed"],
    ],
    city: [
        ["paris", "tokyo"],
        ["lima", "oslo"],
    ],
    emotion: [
        ["joy", "calm"],
        ["awe", "hope"],
    ],
};

describe("against a local fake gen", () => {
    let server;
    let api;
    const prompts = [];

    before(async () => {
        server = createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk;
            });
            req.on("end", () => {
                const { model, messages, seed, max_tokens } = JSON.parse(body);
                const prompt = messages[0].content;
                prompts.push({ model, seed, max_tokens });
                const send = (status, payload) => {
                    res.writeHead(status, {
                        "Content-Type": "application/json",
                    });
                    res.end(JSON.stringify(payload));
                };
                const reply = (content, finish_reason = "stop") =>
                    send(200, {
                        choices: [{ message: { content }, finish_reason }],
                        usage: { prompt_tokens: 20, completion_tokens: 2 },
                    });
                if (model === "vendor/revoked")
                    return send(401, { error: "invalid key" });
                if (model === "vendor/broken")
                    return send(500, { error: "boom" });
                if (model === "vendor/no-usage")
                    return send(200, {
                        choices: [{ message: { content: "OK" } }],
                    });
                if (model === "vendor/cut-off") return reply("O", "length");
                const found = PROBES.find((p) => p.prompt === prompt);
                if (!found) return reply("OK");
                if (model === "vendor/chatty")
                    return reply(
                        "Sure! Here is my pick for you: something nice.",
                    );
                const family = model === "vendor/other" ? 1 : 0;
                const [first, second] = FAVOURITES[found.id][family];
                const answer = createRng(seed)() < 0.6 ? first : second;
                if (model === "vendor/thinker")
                    return reply(
                        `<think>The user wants one ${found.id}. Let me think.</think>\n\n**${answer}**`,
                    );
                reply(answer);
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        api = {
            baseUrl: `http://127.0.0.1:${server.address().port}`,
            key: "sk_test",
            timeoutMs: 2000,
        };
    });

    after(() => server.close());

    let reference;
    before(async () => {
        reference = await buildReference({
            model: "vendor/official",
            repetitions: MIN_REPETITIONS,
            seed: 1,
            api,
        });
    });

    const compare = (candidate, seed = 5000) =>
        compareWithReference({ candidate, reference, seed, api });

    test("a reference stores fixed settings, the probe set version and every cell", () => {
        assert.equal(reference.status, "reference");
        assert.equal(reference.probeSet, 1);
        assert.deepEqual(reference.settings, {
            repetitions: 8,
            maxTokens: 1024,
            seed: 1,
        });
        for (const p of PROBES) {
            const answers = reference.cells[p.id].answers;
            assert.equal(
                Object.values(answers).reduce((a, b) => a + b, 0),
                8,
            );
            for (const answer of Object.keys(answers))
                assert.ok(FAVOURITES[p.id][0].includes(answer));
        }
        // Every probe request uses its own seed so gen's cache cannot replay one answer.
        const seeds = prompts
            .filter((p) => p.model === "vendor/official")
            .map((p) => p.seed);
        assert.equal(new Set(seeds).size, seeds.length);
        assert.ok(prompts.every((p) => p.max_tokens === 1024));
    });

    test("fewer than eight repetitions are refused", async () => {
        await assert.rejects(
            buildReference({
                model: "vendor/official",
                repetitions: 7,
                seed: 1,
                api,
            }),
            /at least 8 repetitions/,
        );
    });

    test("repeated runs of the official model match its own reference", async () => {
        for (const seed of [5000, 90_000, 1_234_567]) {
            const report = await compare("vendor/official", seed);
            assert.equal(report.status, "match", `seed ${seed}`);
            assert.equal(report.usableCells, PROBES.length);
            assert.equal(report.review, "human");
        }
    });

    test("a reasoning model that wraps the same answers still matches", async () => {
        const report = await compare("vendor/thinker");
        assert.equal(report.status, "match");
        assert.equal(report.usableCells, PROBES.length);
    });

    test("a different model is a mismatch", async () => {
        const report = await compare("vendor/other");
        assert.equal(report.status, "mismatch");
        assert.equal(report.matchedCells, 0);
        assert.equal(report.divergence, 1);
        assert.match(formatReport(report), /^REVIEW mismatch/);
    });

    test("broken endpoints are reported apart from identity mismatches", async () => {
        const expected = {
            "vendor/broken": "http_500",
            "vendor/no-usage": "missing_usage",
            "vendor/cut-off": "truncated",
        };
        for (const [candidate, reason] of Object.entries(expected)) {
            const report = await compare(candidate);
            assert.equal(report.status, "broken", candidate);
            assert.equal(report.reason, reason);
            assert.equal(report.cells, undefined);
            assert.match(formatReport(report), /identity not judged/);
        }
        const broken = await buildReference({
            model: "vendor/broken",
            seed: 1,
            api,
        });
        assert.deepEqual(broken, {
            model: "vendor/broken",
            status: "broken",
            reason: "http_500",
        });
    });

    test("a healthy endpoint with only malformed answers is inconclusive, not a mismatch", async () => {
        const report = await compare("vendor/chatty");
        assert.equal(report.status, "inconclusive");
        assert.equal(report.usableCells, 0);
        assert.equal(report.candidateCells.animal.errors.invalid, 8);
    });

    test("our own auth failure stops the run instead of blaming the endpoint", async () => {
        await assert.rejects(compare("vendor/revoked"), /http_401/);
    });

    test("references from another probe set version are refused", async () => {
        await assert.rejects(
            compareWithReference({
                candidate: "vendor/official",
                reference: { ...reference, probeSet: 0 },
                seed: 1,
                api,
            }),
            /Rebuild it/,
        );
    });

    test("the CLI saves references and a human-review report", async (t) => {
        const out = mkdtempSync(join(tmpdir(), "fingerprint-"));
        t.after(() => rmSync(out, { recursive: true, force: true }));
        const previousBase = process.env.POLLINATIONS_BASE_URL;
        const log = console.log;
        const lines = [];
        process.env.POLLINATIONS_BASE_URL = api.baseUrl;
        console.log = (line) => lines.push(String(line));
        try {
            const env = { POLLINATIONS_API_KEY: "sk_test" };
            await main(
                [
                    "reference",
                    "--models",
                    "vendor/official",
                    "--seed",
                    "3",
                    "--out",
                    out,
                ],
                env,
            );
            await main(
                [
                    "compare",
                    "--pairs",
                    "vendor/official=vendor/official,vendor/other=vendor/official,vendor/broken=vendor/official",
                    "--seed",
                    "77",
                    "--out",
                    out,
                ],
                env,
            );
            await assert.rejects(
                main(
                    ["compare", "--pairs", "a=vendor/unknown", "--out", out],
                    env,
                ),
                /No reference/,
            );
        } finally {
            console.log = log;
            if (previousBase === undefined)
                delete process.env.POLLINATIONS_BASE_URL;
            else process.env.POLLINATIONS_BASE_URL = previousBase;
        }
        assert.ok(
            existsSync(join(out, "references", "vendor__official.v1.json")),
        );
        const [reportFile] = readdirSync(join(out, "reports"));
        const saved = JSON.parse(
            readFileSync(join(out, "reports", reportFile), "utf-8"),
        );
        assert.deepEqual(
            saved.reports.map((r) => r.status),
            ["match", "mismatch", "broken"],
        );
        assert.ok(lines.some((line) => line.startsWith("ok     match")));
        assert.ok(lines.some((line) => line.startsWith("REVIEW mismatch")));
        assert.ok(lines.some((line) => line.startsWith("REVIEW broken")));
    });
});
