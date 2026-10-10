import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxAgent } from "../e2b-agent.js";
import { createGateway } from "../gateway.js";

const snapshot = { version: "1", catalog: [{ name: "test" }], review: {} };
const env = {
    FLORET_CATALOG: { getByName: () => ({ snapshot: async () => snapshot }) },
};
const request = (stream = false, key = "ag_run") =>
    new Request("https://floret.test/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "floret",
            messages: [{ role: "user", content: "hi" }],
            stream,
        }),
    });
function fixture() {
    const runs = [];
    const start = async (key, catalog) => {
        assert.deepEqual(catalog, snapshot);
        const run = {
            key,
            killed: 0,
            trafficAccessToken: `private-${runs.length}`,
            getHost: () => `run-${runs.indexOf(run)}.test`,
            kill: async () => {
                run.killed++;
            },
            setTimeout: async () => {},
        };
        runs.push(run);
        return run;
    };
    const fetcher = async (url, options) => {
        const run = runs.find((r) => url.includes(r.getHost()));
        assert.equal(options.headers.Authorization, `Bearer ${run.key}`);
        assert.equal(
            options.headers["e2b-traffic-access-token"],
            run.trafficAccessToken,
        );
        return JSON.parse(options.body).stream
            ? new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n')
            : Response.json({ choices: [{ message: { content: "done" } }] });
    };
    return { runs, start, fetcher };
}
test("full streaming and non-streaming runs keep callers apart and destroy their VMs", async () => {
    const { runs, start, fetcher } = fixture();
    const agent = createSandboxAgent(env, start, fetcher);
    const replies = await Promise.all([
        agent.fetch(request(false, "sk_one")),
        agent.fetch(request(true, "ag_two")),
    ]);
    assert.equal((await replies[0].json()).choices[0].message.content, "done");
    assert.match(await replies[1].text(), /data: \[DONE\]/);
    assert.deepEqual(
        runs.map((r) => [r.key, r.killed]),
        [
            ["sk_one", 1],
            ["ag_two", 1],
        ],
    );
});
test("invalid credentials and malformed bodies cannot buy a sandbox", async () => {
    const { runs, start, fetcher } = fixture();
    const gateway = createGateway(
        (e) => createSandboxAgent(e, start, fetcher),
        async () => Response.json({ valid: false }),
    );
    assert.equal((await gateway(request(), env)).status, 401);
    const agent = createSandboxAgent(env, start, fetcher);
    const invalid = new Request("https://floret.test/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer sk_one" },
        body: "{",
    });
    assert.equal((await agent.fetch(invalid)).status, 422);
    assert.equal(runs.length, 0);
});
test("caller cancellation during a run aborts the upstream and releases the VM once", async () => {
    const { runs, start } = fixture();
    let ready;
    const begun = new Promise((resolve) => {
        ready = resolve;
    });
    let cancelled = false;
    const agent = createSandboxAgent(env, start, async (_url, options) => {
        ready();
        return new Response(
            new ReadableStream({
                start(output) {
                    options.signal.addEventListener("abort", () => {
                        cancelled = true;
                        output.error(new Error("cancelled"));
                    });
                },
            }),
        );
    });
    const response = await agent.fetch(request(true));
    const reader = response.body.getReader();
    await reader.read();
    await begun;
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cancelled, true);
    assert.equal(runs[0].killed, 1);
});
test("sandbox permission, budget and capacity failures preserve their status", async () => {
    for (const statusCode of [403, 402, 429]) {
        const agent = createSandboxAgent(env, async () => {
            throw Object.assign(new Error("denied"), { statusCode });
        });
        assert.equal((await agent.fetch(request())).status, statusCode);
        const streamed = await (await agent.fetch(request(true))).text();
        assert.match(streamed, new RegExp(`"code":${statusCode}`));
        assert.match(streamed, /\[DONE\]/);
    }
});
test("HTTP validation failure from the VM still releases it", async () => {
    const { runs, start } = fixture();
    const agent = createSandboxAgent(env, start, async () =>
        Response.json({ detail: "invalid model" }, { status: 422 }),
    );
    assert.equal((await agent.fetch(request())).status, 422);
    assert.equal(runs[0].killed, 1);
});

test("disconnect while provisioning cannot leave the acquired VM running", async () => {
    const { runs, start } = fixture();
    let release;
    let began;
    const waiting = new Promise((resolve) => {
        release = resolve;
    });
    const acquired = new Promise((resolve) => {
        began = resolve;
    });
    const agent = createSandboxAgent(env, async (...args) => {
        const sandbox = await start(...args);
        began();
        await waiting;
        return sandbox;
    });
    const response = await agent.fetch(request(true));
    const reader = response.body.getReader();
    await reader.read();
    await acquired;
    await reader.cancel();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runs[0].killed, 1);
});
