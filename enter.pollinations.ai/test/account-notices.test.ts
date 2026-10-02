import { env } from "cloudflare:test";
import { expect } from "vitest";
import { runAccountNotices } from "@/services/account-notices.ts";
import { processAutoTopUpForUser } from "@/utils/stripe-billing/auto-top-up.ts";
import { test } from "./fixtures.ts";

type SentEmail = { to: string; subject: string; text?: string };

function withOutbox() {
    const sent: SentEmail[] = [];
    const notifyEnv = {
        ...env,
        EMAIL: {
            send: async (message: SentEmail) => {
                sent.push(message);
                return { messageId: crypto.randomUUID() };
            },
        },
    } as unknown as CloudflareBindings;
    return { sent, notifyEnv };
}

async function addUser(
    id: string,
    fields: { packBalance?: number; autoTopUp?: boolean } = {},
) {
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, pack_balance, auto_top_up_enabled, auto_top_up_amount_usd)
        VALUES (?, ?, ?, ?, ?, 10)`,
    )
        .bind(
            id,
            id,
            `${id}@example.com`,
            fields.packBalance ?? 0,
            fields.autoTopUp ? 1 : 0,
        )
        .run();
}

async function addPurchase(userId: string, pollen: number, createdAt: number) {
    await env.DB.prepare(
        `INSERT INTO stripe_checkout_credits (session_id, event_id, event_type, user_id, pollen_credited, created_at)
        VALUES (?, ?, 'checkout.session.completed', ?, ?, ?)`,
    )
        .bind(
            crypto.randomUUID(),
            crypto.randomUUID(),
            userId,
            pollen,
            createdAt,
        )
        .run();
}

test("low-balance email goes once per purchase to buyers under 20% without auto top-up", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const { sent, notifyEnv } = withOutbox();
    await addUser("low", { packBalance: 1.5 });
    await addUser("healthy", { packBalance: 5 });
    await addUser("auto", { packBalance: 0.5, autoTopUp: true });
    await addUser("quest-only");
    for (const id of ["low", "healthy", "auto"]) {
        await addPurchase(id, 10, Date.now() - 60_000);
    }

    await runAccountNotices(notifyEnv);
    await runAccountNotices(notifyEnv);
    expect(sent.map((email) => email.to)).toEqual(["low@example.com"]);
    expect(sent[0].text).toContain("1.50 Pollen left");

    // A new pack re-arms the notice once the balance drops below 20% of it.
    await addPurchase("low", 2, Date.now() + 1);
    await env.DB.prepare(
        "UPDATE user SET pack_balance = 0.3 WHERE id = 'low'",
    ).run();
    await runAccountNotices(notifyEnv);
    expect(sent.map((email) => email.to)).toEqual([
        "low@example.com",
        "low@example.com",
    ]);
});

test("402 email lists every failing key and waits a week before repeating", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const { sent, notifyEnv } = withOutbox();
    await addUser("failing");
    mocks.tinybird.state.paymentRequiredResponse = [
        {
            user_id: "failing",
            api_key_id: "k1",
            api_key_name: "bot",
            error_code: "INSUFFICIENT_BALANCE",
            failures: 40,
        },
        {
            user_id: "failing",
            api_key_id: "k2",
            api_key_name: "script",
            error_code: "KEY_BUDGET_EXHAUSTED",
            failures: 12,
        },
    ];

    await runAccountNotices(notifyEnv);
    await runAccountNotices(notifyEnv);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Requests from your API keys are failing");
    expect(sent[0].text).toContain("bot: 40 failed requests");
    expect(sent[0].text).toContain("script: 12 failed requests");
    expect(mocks.tinybird.state.pipeCalls.at(-1)?.query).toMatchObject({
        environment: "test",
    });
});

test("auto top-up email is sent only when the switch-off actually happens", async () => {
    const { sent, notifyEnv } = withOutbox();
    // No Stripe customer, so the charge attempt switches auto top-up off.
    await addUser("no-card", { packBalance: 2, autoTopUp: true });

    await processAutoTopUpForUser(notifyEnv, "no-card");
    await processAutoTopUpForUser(notifyEnv, "no-card");

    expect(sent.map((email) => email.subject)).toEqual(["Auto top-up is off"]);
    expect(sent[0].text).toContain("2.00 Pollen");
});
