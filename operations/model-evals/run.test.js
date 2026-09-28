import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import aiw from "./evals/aiw.js";
import { estimateCost } from "./lib/gen.js";
import { createRng } from "./lib/rng.js";
import { scoreOf } from "./lib/stats.js";
import { runEvals, selectModels } from "./run.js";

// Re-derives each answer from the prompt text alone, so a template edit that
// breaks its own ground truth fails here instead of grading models wrongly.
function answerFromPrompt(prompt) {
    const n = (pattern) => Number(prompt.match(pattern)[1]);
    if (prompt.startsWith("On a table")) return n(/and (\d+) blue bowls/) + 1;
    if (prompt.includes("cousins")) {
        const family = n(/Alice has (\d+) sisters/) + 1;
        return (
            n(/she has (\d+) nephews/) -
            family +
            (n(/has (\d+) nephews and nieces in total/) - family) +
            n(/also (\d+) sons?/)
        );
    }
    return n(/she also has (\d+) sisters?/) + 1;
}

describe("aiw questions", () => {
    test("LAION's reference AIW+ example is worked out the same way", () => {
        const reference =
            "Alice has 3 sisters. Her mother has 1 sister who does not have children - she has 7 nephews and nieces and also 2 brothers. Alice's father has a brother who has 5 nephews and nieces in total, and who has also 1 son. How many cousins does Alice's sister have?";
        assert.equal(answerFromPrompt(reference), 5);
    });

    test("every generated answer matches its own prompt", () => {
        const questions = aiw.questions({ rng: createRng(7), samples: 200 });
        assert.equal(questions.length, 600);
        for (const question of questions) {
            assert.equal(question.answer, answerFromPrompt(question.prompt));
            assert.match(question.prompt, /### Answer: /);
        }
        assert.deepEqual(
            [...new Set(questions.map((question) => question.family))],
            aiw.families,
        );
    });

    test("the seed decides the numbers: same seed repeats, another seed is fresh", () => {
        const ask = (seed) =>
            aiw
                .questions({ rng: createRng(seed), samples: 5 })
                .map((question) => question.prompt);
        assert.deepEqual(ask(1), ask(1));
        assert.notDeepEqual(ask(1), ask(2));
    });
});

describe("aiw grading", () => {
    const question = { answer: 5 };
    test("reads the last '### Answer:' and tolerates markdown", () => {
        assert.ok(aiw.grade("thinking...\n### Answer: 5", question));
        assert.ok(aiw.grade("### Answer: **5**", question));
        assert.ok(
            aiw.grade("### Answer: 4\nOn reflection\n### Answer: 5", question),
        );
        assert.ok(
            !aiw.grade("### Answer: 5\nno wait\n### Answer: 6", question),
        );
        assert.ok(!aiw.grade("The answer is 5", question));
        assert.ok(!aiw.grade("### Answer: 50", question));
        assert.ok(!aiw.grade(undefined, question));
    });
});

describe("scores", () => {
    test("margin of error follows Wilson's interval", () => {
        const half = scoreOf(5, 10);
        assert.equal(half.rate, 0.5);
        assert.ok(Math.abs(half.moe - 0.2634) < 0.001);
        assert.ok(scoreOf(0, 10).moe > 0.1, "0% is not certain at n=10");
        assert.ok(scoreOf(10, 10).moe > 0.1, "100% is not certain at n=10");
        assert.ok(scoreOf(50, 100).moe < scoreOf(5, 10).moe);
    });

    test("cost is reported usage times catalog prices, cached tokens discounted", () => {
        const pricing = {
            promptTextTokens: "0.001",
            promptCachedTokens: "0.0001",
            completionTextTokens: "0.01",
        };
        const cost = estimateCost(
            {
                prompt_tokens: 100,
                completion_tokens: 10,
                prompt_tokens_details: { cached_tokens: 40 },
            },
            pricing,
        );
        assert.ok(
            Math.abs(cost - (60 * 0.001 + 40 * 0.0001 + 10 * 0.01)) < 1e-9,
        );
        assert.equal(estimateCost(undefined, pricing), 0);
    });
});

const CATALOG = [
    {
        name: "openai/pricey",
        aliases: ["pricey"],
        community: false,
        pricing: {
            promptTextTokens: "0.00001",
            completionTextTokens: "0.00005",
        },
    },
    {
        name: "community/x/pricey",
        aliases: [],
        community: true,
        pricing: {
            promptTextTokens: "0.000001",
            completionTextTokens: "0.000005",
        },
    },
    {
        name: "vendor/cheap",
        aliases: [],
        community: false,
        pricing: {
            promptTextTokens: "0.0000001",
            completionTextTokens: "0.0000005",
        },
    },
];

describe("selectModels", () => {
    test("filters by scope and starts with the cheapest", () => {
        assert.deepEqual(
            selectModels(CATALOG, { scope: "all" }).map((m) => m.name),
            ["vendor/cheap", "community/x/pricey", "openai/pricey"],
        );
        assert.deepEqual(
            selectModels(CATALOG, { scope: "community" }).map((m) => m.name),
            ["community/x/pricey"],
        );
        assert.deepEqual(
            selectModels(CATALOG, { scope: "official" }).map((m) => m.name),
            ["vendor/cheap", "openai/pricey"],
        );
    });

    test("takes names or aliases and rejects unknown ones", () => {
        assert.deepEqual(
            selectModels(CATALOG, { models: ["PRICEY", "vendor/cheap"] }).map(
                (m) => m.name,
            ),
            ["vendor/cheap", "openai/pricey"],
        );
        assert.throws(
            () => selectModels(CATALOG, { models: ["nope"] }),
            /Unknown model\(s\): nope/,
        );
    });
});

describe("runEvals against a real HTTP server", () => {
    const requests = [];
    let server;
    let baseUrl;
    let limited = new Set();

    before(async () => {
        server = createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk;
            });
            req.on("end", () => {
                const { model, messages, seed } = JSON.parse(body);
                requests.push({ model, seed, auth: req.headers.authorization });
                const prompt = messages[0].content;
                const send = (status, payload, headers = {}) => {
                    res.writeHead(status, {
                        "Content-Type": "application/json",
                        ...headers,
                    });
                    res.end(JSON.stringify(payload));
                };
                if (model === "vendor/broken")
                    return send(500, { error: "boom" });
                if (model === "vendor/limited" && !limited.has(seed)) {
                    limited.add(seed);
                    return send(
                        429,
                        { error: "slow down" },
                        { "retry-after": "0" },
                    );
                }
                const truth = answerFromPrompt(prompt);
                const answer = model === "vendor/wrong" ? truth + 1 : truth;
                send(200, {
                    choices: [
                        { message: { content: `### Answer: ${answer}` } },
                    ],
                    usage: { prompt_tokens: 100, completion_tokens: 10 },
                });
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => server.close());

    const pricing = { promptTextTokens: "0.001", completionTextTokens: "0.01" };
    const model = (name, extra = {}) => ({
        name,
        aliases: [],
        community: false,
        pricing,
        ...extra,
    });
    const run = (models, extra = {}) =>
        runEvals({
            models,
            samples: 4,
            seed: 11,
            budget: 100,
            concurrency: 2,
            api: { baseUrl, key: "sk_test", timeoutMs: 2000 },
            ...extra,
        });

    test("scores right, wrong, erroring, and rate-limited models", async () => {
        requests.length = 0;
        limited = new Set();
        const { results, estimatedCost } = await run([
            model("vendor/right"),
            model("vendor/wrong", { community: true }),
            model("vendor/broken"),
            model("vendor/limited"),
        ]);
        const byName = Object.fromEntries(
            results[0].models.map((m) => [m.name, m]),
        );

        assert.equal(byName["vendor/right"].correct, 12);
        assert.equal(byName["vendor/right"].rate, 1);
        assert.ok(byName["vendor/right"].moe > 0);
        assert.equal(byName["vendor/wrong"].correct, 0);
        assert.equal(byName["vendor/wrong"].community, true);
        // Errors count as wrong answers, not as skipped questions.
        assert.equal(byName["vendor/broken"].questions, 12);
        assert.equal(byName["vendor/broken"].failed, 12);
        assert.deepEqual(byName["vendor/broken"].errors, { http_500: 12 });
        assert.equal(byName["vendor/broken"].correct, 0);
        // A 429 is retried, not held against the model.
        assert.equal(byName["vendor/limited"].correct, 12);
        assert.equal(byName["vendor/limited"].failed, 0);
        assert.equal(byName["vendor/right"].families.bowls.total, 4);

        // 3 answering models x 12 questions x (100 x 0.001 + 10 x 0.01).
        assert.ok(Math.abs(estimatedCost - 3 * 12 * 0.2) < 1e-9);
        assert.ok(requests.every((r) => r.auth === "Bearer sk_test"));
    });

    test("every question of a run gets its own seed, so nothing is served from gen's cache", async () => {
        requests.length = 0;
        await run([model("vendor/right")]);
        assert.equal(
            new Set(requests.map((r) => r.seed)).size,
            requests.length,
        );
    });

    test("once the budget is spent no further model starts", async () => {
        requests.length = 0;
        const { results } = await run(
            [model("vendor/right"), model("vendor/wrong")],
            {
                budget: 0,
                concurrency: 1,
            },
        );
        assert.deepEqual(
            results[0].models.map((m) => m.status),
            ["skipped", "skipped"],
        );
        assert.equal(requests.length, 0);
    });

    test("the budget also cuts a model off mid-way, overshooting by at most the requests in flight", async () => {
        requests.length = 0;
        // Each answer costs 0.2 Pollen; the budget of 1 is crossed after 5.
        const { results, estimatedCost } = await run(
            [model("vendor/right"), model("vendor/wrong")],
            { budget: 1, concurrency: 1 },
        );
        assert.deepEqual(
            results[0].models.map((m) => m.status),
            ["skipped", "skipped"],
        );
        assert.ok(estimatedCost >= 1 && estimatedCost <= 1 + 4 * 0.2 + 1e-9);
        assert.ok(requests.length <= 9);
    });

    test("a timeout counts as a failed answer", async () => {
        const stalled = createServer(() => {});
        await new Promise((resolve) => stalled.listen(0, "127.0.0.1", resolve));
        try {
            const { results } = await run([model("vendor/hangs")], {
                samples: 1,
                api: {
                    baseUrl: `http://127.0.0.1:${stalled.address().port}`,
                    key: "sk_test",
                    timeoutMs: 50,
                },
            });
            const [entry] = results[0].models;
            assert.equal(entry.failed, 3);
            assert.deepEqual(entry.errors, { timeout: 3 });
        } finally {
            stalled.closeAllConnections();
            stalled.close();
        }
    });
});
