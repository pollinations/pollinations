import assert from "node:assert/strict";
import test from "node:test";
import ideaJudge from "./agent.ts";

type Handlers = Record<string, (init?: RequestInit) => Promise<Response>>;

function ctx(handlers: Handlers, body: unknown, rawBody?: string) {
    const calls: string[] = [];
    return {
        calls,
        request: new Request("https://example.com/", {
            method: "POST",
            body: rawBody ?? JSON.stringify(body),
        }),
        pollinations: async (path: string, init?: RequestInit) => {
            calls.push(path);
            const handler = handlers[path];
            if (!handler) throw new Error(`unexpected call to ${path}`);
            return handler(init);
        },
    };
}

const LEGEND = {
    "0": "none",
    "1": "low",
    "2": "some",
    "3": "high",
    "4": "max",
};

function scoreAnswer(score: number) {
    return {
        type: "score",
        score,
        legend: LEGEND,
        probabilities: { "0": 0, "1": 0, "2": 1, "3": 0, "4": 0 },
        confidence: 0.9,
    };
}

function verdictAnswer(choice: string, probs?: Record<string, number>) {
    return {
        type: "choice",
        choice,
        probabilities: probs ?? { kill: 0.1, fix: 0.2, ship: 0.7 },
        confidence: 0.8,
    };
}

function decisions(answers: unknown) {
    return Response.json({ answers });
}

const okExplainer = () =>
    Response.json({ choices: [{ message: { content: "Good because." } }] });

test("ships a strong idea and asks Jev all four questions", async () => {
    let sent: {
        state?: { idea?: string };
        questions?: Record<string, { type: string }>;
    } = {};
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async (init) => {
                    sent = JSON.parse(init?.body as string);
                    return decisions({
                        demand: scoreAnswer(3.6),
                        feasibility: scoreAnswer(4),
                        novelty: scoreAnswer(2.8),
                        verdict: verdictAnswer("ship"),
                    });
                },
                "/v1/chat/completions": okExplainer,
            },
            { input: "A meal-kit service for solo hikers" },
        ),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(sent.questions ?? {}).sort(), [
        "demand",
        "feasibility",
        "novelty",
        "verdict",
    ]);
    const payload = await response.json();
    assert.equal(payload.verdict.result, "ship");
    assert.equal(payload.verdict.dimensions.demand, 0.9);
    assert.equal(payload.verdict.composite, (0.9 + 1 + 0.7) / 3);
    assert.equal(payload.verdict.agreement_flag, false);
    assert.equal(payload.verdict.partial, false);
    assert.equal(payload.verdict.probabilities.ship, 0.7);
    assert.match(payload.output[0].content[0].text, /^SHIP - Good because\./);
    assert.equal(response.headers.get("x-idea-judge-verdict"), "ship");
});

test("different Jev choices drive different verdicts (kill and fix)", async () => {
    for (const [choice, probs] of [
        ["kill", { kill: 0.8, fix: 0.15, ship: 0.05 }],
        ["fix", { kill: 0.1, fix: 0.75, ship: 0.15 }],
    ] as const) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: scoreAnswer(1),
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(1),
                            verdict: verdictAnswer(choice, probs),
                        }),
                    "/v1/chat/completions": okExplainer,
                },
                { input: "idea" },
            ),
        );
        const payload = await response.json();
        assert.equal(payload.verdict.result, choice);
        assert.deepEqual(payload.verdict.probabilities, probs);
    }
});

test("templated reason replaces the text model on failure", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () =>
                    decisions({
                        demand: scoreAnswer(4),
                        feasibility: scoreAnswer(4),
                        novelty: scoreAnswer(4),
                        verdict: verdictAnswer("ship"),
                    }),
                "/v1/chat/completions": async () =>
                    new Response("boom", { status: 500 }),
            },
            { input: "idea" },
        ),
    );
    const payload = await response.json();
    assert.equal(payload.verdict.result, "ship");
    assert.match(
        payload.output[0].content[0].text,
        /Jev's verdict is SHIP with probabilities/,
    );
});

test("Jev transport error fails closed with 502 and no reason call", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () => {
                    throw new Error("socket reset");
                },
            },
            { input: "idea" },
        ),
    );
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.error.type, "idea_judge_error");
    assert.match(payload.error.message, /network/);
});

test("Jev non-OK response fails closed with 502", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () =>
                    new Response("rate limited", { status: 429 }),
            },
            { input: "idea" },
        ),
    );
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.match(payload.error.message, /HTTP 429/);
});

test("invalid verdict payload fails closed with 502", async () => {
    for (const verdict of [
        undefined,
        verdictAnswer("maybe"),
        { ...verdictAnswer("ship"), confidence: 7 },
        { ...verdictAnswer("ship"), probabilities: { kill: 0.5, fix: 0.5 } },
    ]) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: scoreAnswer(2),
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(2),
                            verdict,
                        }),
                },
                { input: "idea" },
            ),
        );
        assert.equal(response.status, 502, JSON.stringify(verdict));
    }
});

test("invalid dimension with valid verdict is a disclosed partial", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () =>
                    decisions({
                        demand: scoreAnswer(9),
                        feasibility: scoreAnswer(2),
                        novelty: { type: "score", score: "high" },
                        verdict: verdictAnswer("fix"),
                    }),
                "/v1/chat/completions": okExplainer,
            },
            { input: "idea" },
        ),
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.verdict.result, "fix");
    assert.equal(payload.verdict.partial, true);
    assert.equal(payload.verdict.dimensions.demand, null);
    assert.equal(payload.verdict.dimensions.novelty, null);
    assert.equal(payload.verdict.dimensions.feasibility, 0.5);
    assert.equal(payload.verdict.composite, null);
    assert.equal(payload.verdict.agreement_flag, null);
});

test("metadata.context reaches Jev state; content parts flatten", async () => {
    let sent: { state?: { idea?: string; context?: string } } = {};
    await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async (init) => {
                    sent = JSON.parse(init?.body as string);
                    return decisions({
                        demand: scoreAnswer(2),
                        feasibility: scoreAnswer(2),
                        novelty: scoreAnswer(2),
                        verdict: verdictAnswer("fix"),
                    });
                },
                "/v1/chat/completions": okExplainer,
            },
            {
                input: [
                    { type: "input_text", text: "A" },
                    { type: "input_text", text: "B" },
                ],
                metadata: { context: "bootstrapped solo founder" },
            },
        ),
    );
    assert.equal(sent.state?.idea, "A\nB");
    assert.equal(sent.state?.context, "bootstrapped solo founder");
});

test("oversized input is truncated before the Jev call", async () => {
    let sent: { state?: { idea?: string } } = {};
    await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async (init) => {
                    sent = JSON.parse(init?.body as string);
                    return decisions({
                        demand: scoreAnswer(2),
                        feasibility: scoreAnswer(2),
                        novelty: scoreAnswer(2),
                        verdict: verdictAnswer("fix"),
                    });
                },
                "/v1/chat/completions": okExplainer,
            },
            { input: "x".repeat(20000) },
        ),
    );
    assert.equal(sent.state?.idea?.length, 8001); // 8000 chars + ellipsis
});

test("empty input is a 400 without any upstream call", async () => {
    const response = await ideaJudge(ctx({}, { input: "   " }));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error.message, /idea text/);
});

// Captured verbatim from POST /alpha/decisions (model jev) for the idea
// "A blockchain-based loyalty program for neighborhood bakeries".
const JEV_FIXTURE = {
    answers: {
        novelty: {
            type: "score",
            score: 1.89,
            legend: {
                "0": "Exact copies exist everywhere",
                "1": "Common with minor tweaks",
                "2": "Some novel elements",
                "3": "Clearly differentiated",
                "4": "First of its kind",
            },
            probabilities: { "0": 0, "1": 0.23, "2": 0.66, "3": 0.11, "4": 0 },
            confidence: 0.7,
        },
        verdict: {
            type: "choice",
            choice: "fix",
            probabilities: { kill: 0.29, ship: 0.01, fix: 0.7 },
            confidence: 0.55,
        },
        demand: {
            type: "score",
            score: 1.25,
            legend: {
                "0": "No identifiable demand",
                "1": "Weak or anecdotal demand",
                "2": "Moderate demand in a niche",
                "3": "Strong demand in a sizable market",
                "4": "Urgent widespread demand",
            },
            probabilities: { "0": 0.03, "1": 0.7, "2": 0.27, "3": 0, "4": 0 },
            confidence: 0.74,
        },
        feasibility: {
            type: "score",
            score: 1.86,
            legend: {
                "0": "Practically impossible",
                "1": "Very hard",
                "2": "Hard but possible",
                "3": "Straightforward",
                "4": "Trivial with existing tools",
            },
            probabilities: {
                "0": 0,
                "1": 0.2,
                "2": 0.74,
                "3": 0.05,
                "4": 0.01,
            },
            confidence: 0.77,
        },
    },
};

test("live-captured Jev fixture maps to a disclosed, reproducible verdict", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () => Response.json(JEV_FIXTURE),
                "/v1/chat/completions": okExplainer,
            },
            {
                input: "A blockchain-based loyalty program for neighborhood bakeries",
            },
        ),
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.verdict.result, "fix");
    assert.equal(payload.verdict.confidence, 0.55);
    assert.deepEqual(payload.verdict.probabilities, {
        kill: 0.29,
        ship: 0.01,
        fix: 0.7,
    });
    // Raw rung-index scores normalize by score / (rungs - 1).
    assert.equal(payload.verdict.dimensions.demand, 1.25 / 4);
    assert.equal(payload.verdict.dimensions.feasibility, 1.86 / 4);
    assert.equal(payload.verdict.dimensions.novelty, 1.89 / 4);
    const composite = (1.25 / 4 + 1.86 / 4 + 1.89 / 4) / 3;
    assert.equal(payload.verdict.composite, composite);
    assert.equal(payload.verdict.agreement_flag, false);
    assert.equal(payload.verdict.partial, false);
});

test("malformed or non-object request bodies are a 400 with no upstream call", async () => {
    for (const raw of ["{not json", "null", "[1,2]", '"just a string"']) {
        const c = ctx({}, undefined, raw);
        const response = await ideaJudge(c);
        assert.equal(response.status, 400, raw);
        assert.deepEqual(c.calls, []);
    }
});

test("upstream JSON null or missing answers is a 502", async () => {
    for (const payload of ["null", "{}", '{"answers": null}', "42"]) {
        const response = await ideaJudge(
            ctx(
                { "/alpha/decisions": async () => new Response(payload) },
                { input: "idea" },
            ),
        );
        assert.equal(response.status, 502, payload);
    }
});

test("zero-sum and overfull verdict probabilities are rejected with 502", async () => {
    for (const probs of [
        { kill: 0, fix: 0, ship: 0 },
        { kill: 1, fix: 1, ship: 1 },
        { kill: 0.5, fix: 0.2, ship: 0.1 },
    ]) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: scoreAnswer(2),
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(2),
                            verdict: verdictAnswer("ship", probs),
                        }),
                },
                { input: "idea" },
            ),
        );
        assert.equal(response.status, 502, JSON.stringify(probs));
    }
});

test("wrong-shaped legends and missing dimension fields are partials", async () => {
    for (const bad of [
        { ...scoreAnswer(2), legend: "abcde" },
        { ...scoreAnswer(2), legend: [null, null, null, null, null] },
        {
            ...scoreAnswer(2),
            legend: { a: "x", b: "x", c: "x", d: "x", e: "x" },
        },
        (() => {
            const a = scoreAnswer(2) as Record<string, unknown>;
            delete a.confidence;
            return a;
        })(),
        { ...scoreAnswer(2), probabilities: { "0": 1 } },
    ]) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: bad,
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(2),
                            verdict: verdictAnswer("fix"),
                        }),
                    "/v1/chat/completions": okExplainer,
                },
                { input: "idea" },
            ),
        );
        const payload = await response.json();
        assert.equal(payload.verdict.partial, true, JSON.stringify(bad));
        assert.equal(payload.verdict.dimensions.demand, null);
    }
});

test("error paths never call the reason model", async () => {
    const c1 = ctx(
        {
            "/alpha/decisions": async () => {
                throw new Error("socket reset");
            },
        },
        { input: "idea" },
    );
    assert.equal((await ideaJudge(c1)).status, 502);
    assert.deepEqual(c1.calls, ["/alpha/decisions"]);

    const c2 = ctx({}, { input: "   " });
    assert.equal((await ideaJudge(c2)).status, 400);
    assert.deepEqual(c2.calls, []);
});

test("a contradictory composite sets agreement_flag true", async () => {
    const response = await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () =>
                    decisions({
                        demand: scoreAnswer(4),
                        feasibility: scoreAnswer(4),
                        novelty: scoreAnswer(4),
                        verdict: verdictAnswer("kill", {
                            kill: 0.6,
                            fix: 0.3,
                            ship: 0.1,
                        }),
                    }),
                "/v1/chat/completions": okExplainer,
            },
            { input: "idea" },
        ),
    );
    const payload = await response.json();
    assert.equal(payload.verdict.result, "kill");
    assert.equal(payload.verdict.composite, 1);
    assert.equal(payload.verdict.agreement_flag, true);
});

test("explainer context reaches the reason model", async () => {
    let reasonBody: { messages?: { content?: string }[] } = {};
    await ideaJudge(
        ctx(
            {
                "/alpha/decisions": async () =>
                    decisions({
                        demand: scoreAnswer(2),
                        feasibility: scoreAnswer(2),
                        novelty: scoreAnswer(2),
                        verdict: verdictAnswer("fix"),
                    }),
                "/v1/chat/completions": async (init) => {
                    reasonBody = JSON.parse(init?.body as string);
                    return okExplainer();
                },
            },
            { input: "idea", metadata: { context: "solo founder" } },
        ),
    );
    const userMessage = reasonBody.messages?.[1]?.content ?? "";
    assert.match(userMessage, /Context: solo founder/);
    assert.match(userMessage, /Dimensions \(0-1\): demand 0\.50/);
});

test("extra verdict probability keys or loose sums are rejected with 502", async () => {
    for (const probs of [
        { kill: 0.1, fix: 0.2, ship: 0.7, unexpected: 0 },
        { kill: 0.1, fix: 0.2, ship: 0.61 },
    ]) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: scoreAnswer(2),
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(2),
                            verdict: verdictAnswer("ship", probs),
                        }),
                },
                { input: "idea" },
            ),
        );
        assert.equal(response.status, 502, JSON.stringify(probs));
    }
});

test("invalid dimension probability distributions are partials", async () => {
    for (const probs of [
        { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 },
        { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 },
        { "0": 0.2, "1": 0.2, "2": 0.2, "3": 0.2, "4": 0.2, "5": 0 },
    ]) {
        const response = await ideaJudge(
            ctx(
                {
                    "/alpha/decisions": async () =>
                        decisions({
                            demand: { ...scoreAnswer(2), probabilities: probs },
                            feasibility: scoreAnswer(2),
                            novelty: scoreAnswer(2),
                            verdict: verdictAnswer("fix"),
                        }),
                    "/v1/chat/completions": okExplainer,
                },
                { input: "idea" },
            ),
        );
        const payload = await response.json();
        assert.equal(payload.verdict.partial, true, JSON.stringify(probs));
        assert.equal(payload.verdict.dimensions.demand, null);
        assert.equal(payload.verdict.composite, null);
    }
});
