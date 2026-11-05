// Run with: node --test mama.test.ts
import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-token";
const { checkSignIns, dueWarnings, load } = await import("./mama.ts");

const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString();

test("warns 2 days before the sign-in ends and when its budget is under a day of rent", () => {
    const due = (expiresAt: string | null, pollenBudget: number | null) =>
        dueWarnings({ expiresAt, pollenBudget }, 2).map(([warning]) => warning);
    assert.deepEqual(due(null, null), []);
    assert.deepEqual(due(inDays(3), 5), []);
    assert.deepEqual(due(inDays(1.5), 5), ["expiry"]);
    assert.deepEqual(due(null, 1), ["budget"]);
    // No computer running, no rent to run out of.
    assert.deepEqual(dueWarnings({ expiresAt: null, pollenBudget: 0 }, 0), []);
    const [[, text]] = dueWarnings({ expiresAt: null, pollenBudget: 1 }, 2);
    assert.match(text, /1\.00 Pollen left, about 12 hours.*\/signin/);
});

test("checkSignIns sends each warning once, and nothing when gen fails", async (t) => {
    const owner = {
        key: "sk_owner",
        barbaras: [
            { bot: "running_bot", botId: 1, box: "irunning", created: "" },
            { bot: "deleted_bot", botId: 2, box: "ideleted", created: "" },
        ],
    };
    await load({
        get: async () => ({ 42: owner }),
        put: async () => {},
    } as never);
    // A small box's day of rent is 0.79 Pollen at these rates.
    let signIn = { expiresAt: inDays(1), pollenBudget: 0.5 };
    let failing = false;
    const sent: string[] = [];
    t.mock.method(
        globalThis,
        "fetch",
        async (url: string, init: RequestInit) => {
            const { pathname } = new URL(url);
            if (pathname.endsWith("/sendMessage")) {
                sent.push(JSON.parse(String(init.body)).text);
                return Response.json({ ok: true, result: {} });
            }
            if (failing) return new Response("D1_ERROR", { status: 500 });
            if (pathname === "/account/key") return Response.json(signIn);
            if (pathname === "/alpha/e2b/pricing")
                return Response.json({ vcpuSecond: 3.5e-6, gibSecond: 1.1e-6 });
            if (pathname === "/alpha/e2b/sandboxes/irunning")
                return Response.json({
                    state: "running",
                    cpuCount: 2,
                    memoryMB: 2048,
                });
            return new Response("Sandbox not found", { status: 404 });
        },
    );

    await checkSignIns();
    assert.equal(sent.length, 2);
    assert.match(sent[0], /clear the expiry/);
    assert.match(sent[1], /0\.50 Pollen left, about 15 hours/);
    await checkSignIns();
    failing = true;
    await checkSignIns();
    assert.equal(sent.length, 2);

    // Signed in again without an expiry, which later comes back.
    failing = false;
    signIn = { expiresAt: null, pollenBudget: 0.5 };
    await checkSignIns();
    signIn = { expiresAt: inDays(1), pollenBudget: 0.5 };
    await checkSignIns();
    assert.equal(sent.length, 3);
    assert.match(sent[2], /clear the expiry/);
});
