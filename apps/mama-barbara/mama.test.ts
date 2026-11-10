// Run with: node --test mama.test.ts
import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-token";
const { budgetWarning, checkSignIns, expiryWarning, load, onUpdate } =
    await import("./mama.ts");

const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString();

test("warns 2 days before the sign-in ends and when its budget is under a day of rent", () => {
    const signIn = (expiresAt: string | null, pollenBudget: number | null) => ({
        expiresAt,
        pollenBudget,
    });
    assert.equal(expiryWarning(signIn(null, null)), undefined);
    assert.equal(expiryWarning(signIn(inDays(3), null)), undefined);
    assert.match(expiryWarning(signIn(inDays(1.5), null)) ?? "", /expiry/);
    assert.equal(budgetWarning(signIn(null, null), 2), undefined);
    assert.equal(budgetWarning(signIn(null, 5), 2), undefined);
    // No computer running, no rent to run out of.
    assert.equal(budgetWarning(signIn(null, 0), 0), undefined);
    assert.match(
        budgetWarning(signIn(null, 1), 2) ?? "",
        /1\.00 Pollen left, about 12 hours.*\/signin/,
    );
});

test("checkSignIns sends each warning once, and nothing more when gen fails", async (t) => {
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
    let boxFails = false;
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
            if (boxFails && pathname.startsWith("/alpha/e2b/sandboxes/"))
                return new Response("E2B returned 503", { status: 502 });
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

    // A box that doesn't answer holds back only the budget warning.
    boxFails = true;
    await checkSignIns();
    assert.equal(sent.length, 1);
    assert.match(sent[0], /clear the expiry/);
    boxFails = false;
    await checkSignIns();
    assert.equal(sent.length, 2);
    assert.match(sent[1], /0\.50 Pollen left, about 15 hours/);

    // Neither goes again, nor after failed reads.
    await checkSignIns();
    boxFails = true;
    await checkSignIns();
    boxFails = false;
    failing = true;
    await checkSignIns();
    failing = false;
    await checkSignIns();
    assert.equal(sent.length, 2);

    // Signed in again without an expiry, which later comes back.
    signIn = { expiresAt: null, pollenBudget: 0.5 };
    await checkSignIns();
    signIn = { expiresAt: inDays(1), pollenBudget: 0.5 };
    await checkSignIns();
    assert.equal(sent.length, 3);
    assert.match(sent[2], /clear the expiry/);
});

test("Delete her removes a Barbara whose key the sign-in may not revoke", async (t) => {
    const owner = {
        key: "sk_owner",
        barbaras: [{ bot: "old_bot", botId: 1, box: "iold", created: "" }],
    };
    let saves = 0;
    await load({
        get: async () => ({ 42: owner }),
        put: async () => {
            saves++;
        },
    } as never);
    let revoke = new Response("Enter is down", { status: 500 });
    const shown: string[] = [];
    t.mock.method(
        globalThis,
        "fetch",
        async (url: string, init: RequestInit) => {
            const { pathname } = new URL(url);
            if (pathname.endsWith("/answerCallbackQuery"))
                return Response.json({ ok: true, result: true });
            if (
                pathname.endsWith("/editMessageText") ||
                pathname.endsWith("/sendMessage")
            ) {
                shown.push(JSON.parse(String(init.body)).text);
                return Response.json({ ok: true, result: {} });
            }
            if (pathname === "/account/keys")
                return Response.json({
                    data: [{ id: "k1", name: "polli-sandbox-iold" }],
                });
            if (pathname === "/account/keys/k1") return revoke.clone();
            // Her box is already gone.
            return new Response("Sandbox not found", { status: 404 });
        },
    );
    const tapDelete = () =>
        onUpdate({
            update_id: 1,
            callback_query: {
                id: "q",
                from: { id: 42, first_name: "Owner" },
                data: "deleted:1",
                message: { message_id: 7 },
            },
        });

    // Any other failure keeps her listed, so the owner can try again.
    await tapDelete();
    assert.match(shown[0], /That didn't work: 500/);
    assert.equal(owner.barbaras.length, 1);
    assert.equal(saves, 0);

    revoke = new Response("An API key can only edit or revoke keys…", {
        status: 403,
    });
    await tapDelete();
    assert.match(
        shown[1],
        /@old_bot is deleted\. I couldn't revoke her key polli-sandbox-iold; revoke it at https:\/\/enter\.pollinations\.ai\/keys\./,
    );
    assert.equal(owner.barbaras.length, 0);
    assert.equal(saves, 1);
});
