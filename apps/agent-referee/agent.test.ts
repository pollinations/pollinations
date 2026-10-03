import assert from "node:assert/strict";
import test from "node:test";
import referee from "./agent.ts";

type Handlers = Record<string, (init?: RequestInit) => Promise<Response>>;

function ctx(handlers: Handlers, body: unknown) {
    return {
        request: new Request("https://example.com/", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path: string, init?: RequestInit) => {
            const handler = handlers[path];
            if (!handler) throw new Error(`unexpected call to ${path}`);
            return handler(init);
        },
    };
}

function decisionResponse(probability: number, score: number) {
    return Response.json({
        answers: {
            verified: { noul: probability },
            quality: {
                score,
                legend: { "0": "no support", "4": "full support" },
            },
        },
    });
}

const okExplainer = () =>
    Response.json({ choices: [{ message: { content: "Explained." } }] });

test("strong evidence passes and sends both claim and evidence to Jev", async () => {
    let sent: { state?: { claim?: string; evidence?: string } } = {};
    const response = await referee(
        ctx(
            {
                "/alpha/decisions": async (init) => {
                    sent = JSON.parse(init?.body as string);
                    return decisionResponse(0.92, 4);
                },
                "/v1/chat/completions": okExplainer,
            },
            {
                input: "fixed the null pointer bug",
                metadata: {
                    evidence: "diff adds a null check; npm test passes 42/42",
                },
            },
        ),
    );
    const payload = await response.json();
    assert.equal(payload.verdict.result, "PASS");
    assert.equal(payload.verdict.probability_true, 0.92);
    assert.equal(sent.state?.claim, "fixed the null pointer bug");
    assert.match(sent.state?.evidence ?? "", /42\/42/);
});

test("weak evidence fails against the default threshold", async () => {
    const response = await referee(
        ctx(
            {
                "/alpha/decisions": async () => decisionResponse(0.3, 1),
                "/v1/chat/completions": okExplainer,
            },
            {
                input: "fixed the bug",
                metadata: { evidence: "no tests were run" },
            },
        ),
    );
    const payload = await response.json();
    assert.equal(payload.verdict.result, "FAIL");
    assert.equal(response.headers.get("x-referee-verdict"), "FAIL");
});

test("a custom threshold changes the verdict for the same probability", async () => {
    const run = async (threshold: number) =>
        (
            await referee(
                ctx(
                    {
                        "/alpha/decisions": async () =>
                            decisionResponse(0.5, 3),
                        "/v1/chat/completions": okExplainer,
                    },
                    {
                        input: "partially done",
                        metadata: {
                            evidence: "half the tests pass",
                            threshold,
                        },
                    },
                ),
            )
        ).json();

    assert.equal((await run(0.4)).verdict.result, "PASS");
    assert.equal((await run(0.7)).verdict.result, "FAIL");
});

test("missing evidence still asks Jev, with an empty evidence field", async () => {
    let sent: { state?: { evidence?: string } } = {};
    await referee(
        ctx(
            {
                "/alpha/decisions": async (init) => {
                    sent = JSON.parse(init?.body as string);
                    return decisionResponse(0.1, 0);
                },
                "/v1/chat/completions": okExplainer,
            },
            { input: "it's done, trust me" },
        ),
    );
    assert.equal(sent.state?.evidence, "");
});

test("an empty claim is rejected before calling Jev", async () => {
    const response = await referee(ctx({}, { input: "   " }));
    assert.equal(response.status, 400);
});

test("the explainer failing falls back to a templated sentence citing the probability", async () => {
    const response = await referee(
        ctx(
            {
                "/alpha/decisions": async () => decisionResponse(0.8, 4),
                "/v1/chat/completions": async () =>
                    new Response("boom", { status: 500 }),
            },
            { input: "fixed it", metadata: { evidence: "tests pass" } },
        ),
    );
    const payload = await response.json();
    assert.match(payload.output[0].content[0].text, /0\.80/);
});
