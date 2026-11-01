import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import {
    CORPUS,
    compareUsage,
    formatResult,
    median,
    parsePairs,
    runUsageProbe,
    usageFields,
} from "./usage-probe.js";

describe("usage probe maths", () => {
    test("median of odd, even and empty lists", () => {
        assert.equal(median([3, 1, 2]), 2);
        assert.equal(median([4, 1, 3, 2]), 2.5);
        assert.equal(median([]), null);
    });

    test("usage fields are listed as dotted paths", () => {
        assert.deepEqual(
            usageFields({
                prompt_tokens: 1,
                completion_tokens_details: { reasoning_tokens: 0 },
                cost_usd: 0.1,
            }),
            [
                "prompt_tokens",
                "completion_tokens_details.reasoning_tokens",
                "cost_usd",
            ],
        );
        assert.deepEqual(usageFields(null), []);
    });

    test("pairs need exactly one candidate and one reference", () => {
        assert.deepEqual(parsePairs(" a/b=openai , c=d "), [
            { candidate: "a/b", reference: "openai" },
            { candidate: "c", reference: "d" },
        ]);
        assert.throws(() => parsePairs("a"), /candidate=reference/);
        assert.throws(() => parsePairs("a=b=c"), /candidate=reference/);
        assert.deepEqual(parsePairs(undefined), []);
    });
});

const usageFor = (text, { extra = 0, perChar = 0.25, fields = {} } = {}) => ({
    prompt_tokens: 8 + Math.round([...text].length * perChar) + extra,
    completion_tokens: 4,
    total_tokens: 12,
    ...fields,
});
const items = (options) =>
    CORPUS.map((text) => ({
        chars: [...text].length,
        usage: usageFor(text, options),
    }));

describe("compareUsage", () => {
    test("the same endpoint compared with itself has nothing to review", () => {
        const result = compareUsage(items(), items());
        assert.deepEqual(result.flags, []);
        assert.equal(result.medianDelta, 0);
        assert.equal(result.comparedItems, CORPUS.length);
        assert.equal(result.review, "human");
        assert.match(
            formatResult({ candidate: "a", reference: "b", ...result }),
            /^ok {2}a vs b/,
        );
    });

    test("a constant prompt overhead shows as a delta", () => {
        const result = compareUsage(items({ extra: 11 }), items());
        assert.deepEqual(result.flags, ["input_delta"]);
        assert.equal(result.medianDelta, 11);
        assert.deepEqual(result.deltaRange, [11, 11]);
        assert.ok(result.perItem.every((item) => item.delta === 11));
    });

    test("an overhead on only some requests shows in the range", () => {
        const once = items().map((item, index) =>
            index
                ? item
                : {
                      ...item,
                      usage: {
                          ...item.usage,
                          prompt_tokens: item.usage.prompt_tokens + 4380,
                      },
                  },
        );
        const result = compareUsage(once, items());
        assert.deepEqual(result.flags, ["input_delta"]);
        assert.equal(result.medianDelta, 0);
        assert.deepEqual(result.deltaRange, [0, 4380]);
        assert.match(
            formatResult({ candidate: "a", reference: "b", ...result }),
            /range 0\.\.\+4380 over 16 items$/,
        );
    });

    test("one matching item among failures is not a pass", () => {
        const mostlyBroken = items().map((item, index) =>
            index
                ? { chars: item.chars, usage: null, error: "http_500" }
                : item,
        );
        const result = compareUsage(mostlyBroken, items());
        assert.deepEqual(result.flags, ["incomplete"]);
        assert.equal(result.comparedItems, 1);
        assert.equal(result.perItem[1].candidateError, "http_500");
        assert.match(
            formatResult({ candidate: "a", reference: "b", ...result }),
            /^REVIEW {2}a vs b: .* over 1 items \(errors: candidate 15, reference 0\)$/,
        );
    });

    test("extra and missing usage fields are saved without a flag", () => {
        const result = compareUsage(
            items({ fields: { cost_usd: 0.001 } }),
            items({
                fields: { completion_tokens_details: { reasoning_tokens: 0 } },
            }),
        );
        assert.deepEqual(result.flags, []);
        assert.deepEqual(result.usageFields.extra, ["cost_usd"]);
        assert.deepEqual(result.usageFields.missing, [
            "completion_tokens_details.reasoning_tokens",
        ]);
    });

    test("failed requests are counted, not compared", () => {
        const broken = CORPUS.map((text) => ({
            chars: [...text].length,
            usage: null,
            error: "http_500",
        }));
        const result = compareUsage(broken, items());
        assert.deepEqual(result.flags, ["no_comparable_usage"]);
        assert.equal(result.comparedItems, 0);
        assert.equal(result.errors.candidate, CORPUS.length);
        assert.match(
            formatResult({ candidate: "a", reference: "b", ...result }),
            /no comparable usage \(errors: candidate 16, reference 0\)/,
        );
    });
});

describe("runUsageProbe against a fake gen", () => {
    let server;
    let baseUrl;
    const requests = [];

    before(async () => {
        server = createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk;
            });
            req.on("end", () => {
                const { model, messages, seed, max_tokens } = JSON.parse(body);
                requests.push({ model, seed, max_tokens });
                const text = messages[0].content;
                const send = (status, payload) => {
                    res.writeHead(status, {
                        "Content-Type": "application/json",
                    });
                    res.end(JSON.stringify(payload));
                };
                if (model === "auth") return send(401, { error: "no" });
                if (model === "down") return send(500, { error: "down" });
                const usage =
                    model === "community/x/wrapped"
                        ? usageFor(text, {
                              extra: 11,
                              fields: { cost_usd: 0.001 },
                          })
                        : usageFor(text);
                send(200, {
                    choices: [{ message: { content: "ok" } }],
                    usage,
                });
            });
        });
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => server.close());

    test("probes each model once and reports the wrapper's overhead", async () => {
        requests.length = 0;
        const results = await runUsageProbe({
            pairs: [
                { candidate: "community/x/wrapped", reference: "openai" },
                { candidate: "openai", reference: "openai" },
                { candidate: "down", reference: "openai" },
            ],
            seed: 100,
            api: { baseUrl },
        });
        assert.equal(requests.length, CORPUS.length * 3);
        assert.ok(requests.every((request) => request.max_tokens === 16));
        assert.deepEqual(
            requests
                .filter((request) => request.model === "openai")
                .map((request) => request.seed),
            CORPUS.map((_, index) => 100 + index),
        );
        const [wrapped, self, down] = results;
        assert.deepEqual(wrapped.flags, ["input_delta"]);
        assert.equal(wrapped.medianDelta, 11);
        assert.deepEqual(wrapped.usageFields.extra, ["cost_usd"]);
        assert.deepEqual(self.flags, []);
        assert.deepEqual(down.flags, ["no_comparable_usage"]);
    });

    test("our own auth failure stops the run and keeps finished pairs", async () => {
        const results = [];
        await assert.rejects(
            runUsageProbe({
                pairs: [
                    { candidate: "openai", reference: "openai" },
                    { candidate: "auth", reference: "openai" },
                ],
                seed: 1,
                api: { baseUrl },
                results,
            }),
            /http_401: usage probe cannot continue/,
        );
        assert.equal(results.length, 1);
        assert.deepEqual(results[0].flags, []);
    });
});
