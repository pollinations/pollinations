import { env } from "cloudflare:test";
import { expect } from "vitest";
import {
    lowBalanceNotice,
    paymentRequiredNotice,
    renderNotice,
    runAccountNotices,
    sendNotice,
} from "@/services/account-notices.ts";
import {
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "@/utils/stripe-billing/auto-top-up.ts";
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
    expect(sent[0].text).toContain(
        "We couldn't use your saved payment details",
    );
    expect(sent[0].text).toContain("2.00 Pollen");
});

test("account notice escapes API key names in HTML and keeps the text readable", () => {
    const { html, text } = renderNotice(
        paymentRequiredNotice([
            {
                user_id: "owner",
                api_key_id: "key",
                api_key_name: '<script>alert("x")</script> & test',
                error_code: "KEY_BUDGET_EXHAUSTED",
                failures: 10,
            },
        ]),
        "https://enter.pollinations.ai",
    );

    expect(html).toContain(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; test",
    );
    expect(html).not.toContain("<script>");
    expect(text).toContain('<script>alert("x")</script> & test');
    expect(text).toContain("https://enter.pollinations.ai/keys?");
});

test("an unclassified send failure remains retryable", async () => {
    const notifyEnv = {
        ...env,
        EMAIL: {
            send: async () => {
                throw new Error("temporary email transport failure");
            },
        },
    } as unknown as CloudflareBindings;

    expect(
        await sendNotice(
            notifyEnv,
            "buyer@example.com",
            lowBalanceNotice(1, 10),
        ),
    ).toBe(false);
});

test("auto top-up notice retries after the email quota clears", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const sent: SentEmail[] = [];
    let quotaExceeded = true;
    const notifyEnv = {
        ...env,
        EMAIL: {
            send: async (message: SentEmail) => {
                if (quotaExceeded) {
                    quotaExceeded = false;
                    throw Object.assign(new Error("daily quota reached"), {
                        code: "E_DAILY_LIMIT_EXCEEDED",
                    });
                }
                sent.push(message);
                return { messageId: crypto.randomUUID() };
            },
        },
    } as unknown as CloudflareBindings;
    await addUser("no-card-quota", { packBalance: 2, autoTopUp: true });

    await processAutoTopUpForUser(notifyEnv, "no-card-quota");
    await runAccountNotices(notifyEnv);

    expect(sent.map((email) => email.subject)).toEqual(["Auto top-up is off"]);
});

test("a purchase during email delivery re-arms the low-balance notice", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const sent: SentEmail[] = [];
    await addUser("purchase-race", { packBalance: -9 });
    await addPurchase("purchase-race", 10, Date.now() - 60_000);
    const notifyEnv = {
        ...env,
        EMAIL: {
            send: async (message: SentEmail) => {
                sent.push(message);
                if (sent.length === 1) {
                    await addPurchase("purchase-race", 10, Date.now());
                    await env.DB.prepare(
                        "UPDATE user SET pack_balance = 1 WHERE id = 'purchase-race'",
                    ).run();
                }
                return { messageId: crypto.randomUUID() };
            },
        },
    } as unknown as CloudflareBindings;

    await runAccountNotices(notifyEnv);
    await runAccountNotices(notifyEnv);

    expect(sent.map((email) => email.to)).toEqual([
        "purchase-race@example.com",
        "purchase-race@example.com",
    ]);
});

test("low-balance email skips active bans but not expired ones", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const { sent, notifyEnv } = withOutbox();
    await addUser("ban-expired", { packBalance: 1 });
    await addUser("ban-active", { packBalance: 1 });
    for (const id of ["ban-expired", "ban-active"]) {
        await addPurchase(id, 10, Date.now() - 60_000);
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
        "UPDATE user SET banned = 1, ban_expires = ? WHERE id = 'ban-expired'",
    )
        .bind(nowSeconds - 60)
        .run();
    await env.DB.prepare(
        "UPDATE user SET banned = 1, ban_expires = ? WHERE id = 'ban-active'",
    )
        .bind(nowSeconds + 3600)
        .run();

    await runAccountNotices(notifyEnv);

    expect(sent.map((email) => email.to)).toEqual(["ban-expired@example.com"]);
});

test("switching auto top-up off yourself cancels a pending notice", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");
    const { sent, notifyEnv } = withOutbox();
    await addUser("manual-off", { packBalance: 2 });
    await env.DB.prepare(
        "UPDATE user SET auto_top_up_off_notice_due = 1 WHERE id = 'manual-off'",
    ).run();

    await updateAutoTopUpSettings(notifyEnv, "manual-off", { enabled: false });
    await runAccountNotices(notifyEnv);

    expect(sent).toEqual([]);
});
