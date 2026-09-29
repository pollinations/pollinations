// Run with:  node --test agent.test.ts   (Node 22.18+, no dependencies)
import assert from "node:assert/strict";
import test from "node:test";
import agent, { type Answers, decide, textOf } from "./agent.ts";

const answers = (
    tests: Record<string, number>,
    diff: number,
    overclaim: number,
): Answers => ({
    tests: { probabilities: tests },
    diff: { noul: diff },
    overclaim: { noul: overclaim },
});

test("decide: probabilities become a verdict", () => {
    const cases: [string, Answers, string][] = [
        ["all green", answers({ passed: 1 }, 0.96, 0.38), "ACCEPT"],
        ["failing test", answers({ failed: 1 }, 0.9, 0.93), "REJECT"],
        [
            "diff misses the claim",
            answers({ passed: 0.6 }, 0.08, 0.92),
            "REJECT",
        ],
        [
            "tests never run",
            answers({ not_run: 1 }, 0.9, 0.95),
            "NEEDS_EVIDENCE",
        ],
        [
            "claim overreaches",
            answers({ passed: 0.94 }, 0.68, 0.95),
            "NEEDS_EVIDENCE",
        ],
        [
            "unsure tests",
            answers({ passed: 0.6, unrelated: 0.4 }, 0.9, 0.2),
            "NEEDS_EVIDENCE",
        ],
    ];
    for (const [name, input, verdict] of cases) {
        assert.equal(decide(input), verdict, name);
    }
});

test("textOf reads user turns from Responses input and chat messages", () => {
    assert.equal(textOf("plain"), "plain");
    assert.equal(
        textOf([
            { role: "system", content: "ignore" },
            { role: "user", content: [{ type: "input_text", text: "claim" }] },
            { role: "assistant", content: "earlier" },
            { role: "user", content: "diff" },
        ]),
        "claim\ndiff",
    );
});

type Sent = {
    state: string;
    questions: object;
    messages: { content: string }[];
};

function run(body: unknown, jevStatus = 200) {
    const calls: Record<string, Sent> = {};
    const request = new Request("https://agent.test/", {
        method: "POST",
        body: JSON.stringify(body),
    });
    const result = agent({
        request,
        pollinations: async (path, init) => {
            calls[path] = JSON.parse(String(init?.body));
            if (path === "/alpha/decisions") {
                return Response.json(
                    { answers: answers({ not_run: 1 }, 0.4, 0.8) },
                    { status: jevStatus },
                );
            }
            return Response.json({
                choices: [{ message: { content: " Run npm test. " } }],
            });
        },
    });
    return { calls, result };
}

const LINE =
    "Verdict: NEEDS_EVIDENCE | tests passed 0%, failed 0% | diff matches claim 40% | claim unsupported 80%";

test("asks Jev about the report and answers with its probabilities", async () => {
    const { calls, result } = run({
        messages: [{ role: "user", content: "Claim: done. No diff." }],
    });
    const json = await (await result).json();

    assert.equal(calls["/alpha/decisions"].state, "Claim: done. No diff.");
    assert.deepEqual(Object.keys(calls["/alpha/decisions"].questions), [
        "tests",
        "diff",
        "overclaim",
    ]);
    assert.match(
        calls["/v1/chat/completions"].messages[0].content,
        /verdict is NEEDS_EVIDENCE.*no evidence/,
    );
    assert.equal(json.output[0].content[0].text, `${LINE}\nRun npm test.`);
});

test("streams the same message as Responses SSE events", async () => {
    const { result } = run({ input: "claim", stream: true });
    const response = await result;
    const text = await response.text();

    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.match(text, /event: response\.output_text\.delta/);
    assert.ok(
        text.includes(JSON.stringify(`${LINE}\nRun npm test.`).slice(1, -1)),
    );
    assert.match(text, /event: response\.completed/);
});

test("surfaces a Jev error instead of guessing a verdict", async () => {
    const { result } = run({ input: "claim" }, 402);
    await assert.rejects(result, /\/alpha\/decisions 402/);
});
