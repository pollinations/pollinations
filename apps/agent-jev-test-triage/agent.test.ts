import assert from "node:assert/strict";
import test from "node:test";
import agent from "./agent.ts";

const REPORT = `FAIL test/models-retrieve.test.ts > narrows the model list by query
AssertionError: expected [ 'openai/gpt-5.4-nano' ] to deeply equal [ 'flux.1.1-pro' ]
    at test/models-retrieve.test.ts:672:9
Command: npx vitest run test/models-retrieve.test.ts`;

const choice = (value: string) => ({
    type: "choice",
    choice: value,
    probabilities: { [value]: 0.8, other: 0.2 },
    confidence: 0.8,
});
const noul = (value: number) => ({ type: "noul", noul: value });
const score = (value: number) => ({
    type: "score",
    score: value,
    legend: { "0": "a", "1": "b", "2": "c", "3": "d" },
});

type DecisionBody = {
    model: string;
    state: string;
    questions: Record<string, { type: string }>;
};

/** Runs the agent against canned Jev answers and returns what it asked the model to say. */
async function run(answers: Record<string, unknown>) {
    const seen: { path: string; body: DecisionBody }[] = [];
    let instructions = "";
    let model = "";

    const response = await agent({
        request: new Request("https://example.test/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: REPORT }],
            }),
        }),
        pollinations: async (path, init) => {
            seen.push({
                path,
                body: JSON.parse(String(init?.body)) as DecisionBody,
            });
            return Response.json({
                model: "typesafe/jev-1.13",
                answers,
                usage: { input_tokens: 1, output_tokens: 1 },
            });
        },
        model: (id) => {
            model = id;
            return id;
        },
        respond: async (settings) => {
            instructions = String(settings.instructions);
            return Response.json({ ok: true });
        },
    });

    assert.equal(response.status, 200);
    return { seen, instructions, model };
}

test("asks Jev all four questions about the failing run", async () => {
    const { seen, model } = await run({
        verdict: choice("real-bug"),
        reproduces: noul(0.7),
        evidence: noul(0.9),
        blocker: score(2.4),
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].path, "/alpha/decisions");
    assert.equal(seen[0].body.model, "jev");
    assert.equal(seen[0].body.state.includes("narrows the model list"), true);
    assert.deepEqual(Object.keys(seen[0].body.questions).sort(), [
        "blocker",
        "evidence",
        "reproduces",
        "verdict",
    ]);
    assert.equal(seen[0].body.questions.verdict.type, "choice");
    assert.equal(seen[0].body.questions.reproduces.type, "noul");
    assert.equal(seen[0].body.questions.blocker.type, "score");
    assert.equal(model, "openai/gpt-5.4-nano");
});

test("acts on a real-bug verdict by pointing at the diff", async () => {
    const { instructions } = await run({
        verdict: choice("real-bug"),
        reproduces: noul(0.7),
        evidence: noul(0.9),
        blocker: score(2.4),
    });

    assert.match(instructions, /action=fix/);
    assert.match(instructions, /Failing file: test\/models-retrieve\.test\.ts/);
    assert.match(instructions, /git diff -- test\/models-retrieve\.test\.ts/);
});

test("collects evidence instead of acting on a weak report", async () => {
    const { instructions } = await run({
        verdict: choice("flake"),
        reproduces: noul(0.4),
        evidence: noul(0.2),
        blocker: score(1.2),
    });

    assert.match(instructions, /action=collect-evidence/);
    assert.match(instructions, /git stash && npx vitest run/);
});

test("repairs the environment when Jev blames the setup", async () => {
    const { instructions } = await run({
        verdict: choice("environment"),
        reproduces: noul(0.95),
        evidence: noul(0.9),
        blocker: score(3),
    });

    assert.match(instructions, /action=repair \(now\)/);
    assert.match(instructions, /npm ci && npm test/);
});

test("contradictory answers fall back to gathering evidence", async () => {
    // Called a flake, but also said it reproduces: do not trust either.
    const { instructions } = await run({
        verdict: choice("flake"),
        reproduces: noul(0.9),
        evidence: noul(0.9),
        blocker: score(2),
    });

    assert.match(instructions, /action=collect-evidence/);
});

test("quotes Jev's probabilities back to the caller", async () => {
    const { instructions } = await run({
        verdict: choice("real-bug"),
        reproduces: noul(0.71),
        evidence: noul(0.62),
        blocker: score(2.56),
    });

    assert.match(instructions, /Jev `typesafe\/jev-1\.13`/);
    assert.match(instructions, /verdict=real-bug \(p real-bug 0\.80,/);
    assert.match(instructions, /reproduces=0\.71/);
    assert.match(instructions, /evidence=0\.62/);
    assert.match(instructions, /blocker=2\.56\/3/);
});
