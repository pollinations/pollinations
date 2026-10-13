import { env, SELF } from "cloudflare:test";
import { expect } from "vitest";
import { processAutoTopUpForUser } from "@/utils/stripe-billing/auto-top-up.ts";
import { test } from "./fixtures.ts";

type SentEmail = {
    to: string;
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
};

function withOutbox(fail = false) {
    const sent: SentEmail[] = [];
    const notifyEnv = {
        ...env,
        EMAIL: {
            send: async (message: SentEmail) => {
                if (fail) {
                    throw Object.assign(new Error("rate limited"), {
                        code: "E_RATE_LIMIT_EXCEEDED",
                    });
                }
                sent.push(message);
                return { messageId: crypto.randomUUID() };
            },
        },
    } as unknown as CloudflareBindings;
    return { sent, notifyEnv };
}

async function addUser(
    id: string,
    fields: { packBalance: number; autoTopUp?: boolean },
) {
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, pack_balance, auto_top_up_enabled, auto_top_up_amount_usd)
        VALUES (?, ?, ?, ?, ?, 10)`,
    )
        .bind(
            id,
            id,
            `${id}@example.com`,
            fields.packBalance,
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

const notifiedAt = async (userId: string) =>
    (
        await env.DB.prepare(
            "SELECT low_balance_notified_at AS at FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ at: number | null }>()
    )?.at;

const unsubscribedAt = async (userId: string) =>
    (
        await env.DB.prepare(
            "SELECT email_unsubscribed_at AS at FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ at: number | null }>()
    )?.at;

test("running-low email goes out once per 30 days below the threshold", async () => {
    const { sent, notifyEnv } = withOutbox();
    await addUser("low", { packBalance: 3 });
    await addUser("healthy", { packBalance: 6 });
    await addPurchase("low", 20, Date.now() - 4 * 24 * 60 * 60 * 1000);

    for (const id of ["low", "low", "healthy"]) {
        expect(await processAutoTopUpForUser(notifyEnv, id)).toEqual({
            status: "skipped",
            reason: "auto top-up disabled",
        });
    }
    expect(sent.map((email) => email.to)).toEqual(["low@example.com"]);
    expect(sent[0].subject).toBe("Your paid Pollen is running low");
    expect(sent[0].text).toContain(
        "You have 3.00 Pollen left in your paid balance.",
    );
    expect(sent[0].text).toContain(
        "Your last pack of 20.00 Pollen lasted 4 days.",
    );
    expect(sent[0].html).toContain("/quests");

    await env.DB.prepare(
        "UPDATE user SET low_balance_notified_at = ? WHERE id = 'low'",
    )
        .bind(Date.now() - 31 * 24 * 60 * 60 * 1000)
        .run();
    await processAutoTopUpForUser(notifyEnv, "low");
    expect(sent).toHaveLength(2);
});

test("a failed running-low email frees the slot for the next crossing", async () => {
    await addUser("bounce", { packBalance: 1 });

    await processAutoTopUpForUser(withOutbox(true).notifyEnv, "bounce");
    expect(await notifiedAt("bounce")).toBeNull();

    const { sent, notifyEnv } = withOutbox();
    await processAutoTopUpForUser(notifyEnv, "bounce");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("Your last pack");
    expect(await notifiedAt("bounce")).not.toBeNull();
});

test("switching auto top-up off emails once and replaces the running-low email", async () => {
    const { sent, notifyEnv } = withOutbox();
    // No Stripe customer: the trigger turns auto top-up off before any charge.
    await addUser("nocard", { packBalance: 2, autoTopUp: true });

    expect(await processAutoTopUpForUser(notifyEnv, "nocard")).toEqual({
        status: "skipped",
        reason: "missing Stripe customer",
    });
    expect(await processAutoTopUpForUser(notifyEnv, "nocard")).toEqual({
        status: "skipped",
        reason: "auto top-up disabled",
    });
    expect(sent.map((email) => email.subject)).toEqual(["Auto top-up is off"]);
    expect(sent[0].text).toContain("paid balance of 2.00 Pollen");
});

test("the unsubscribe link stops every email", async () => {
    const { sent, notifyEnv } = withOutbox();
    await addUser("leaver", { packBalance: 3 });
    await processAutoTopUpForUser(notifyEnv, "leaver");
    expect(sent[0].headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
    );
    const link = sent[0].headers["List-Unsubscribe"].slice(1, -1);
    expect(sent[0].text).toContain(link);

    const forged = new URL(link);
    forged.searchParams.set("u", "healthy");
    expect((await SELF.fetch(forged, { method: "POST" })).status).toBe(400);

    // Opening the link only asks, so mail scanners can't unsubscribe anyone.
    expect(await (await SELF.fetch(link)).text()).toContain(
        '<form method="post">',
    );
    expect(await unsubscribedAt("leaver")).toBeNull();
    // A mail client's one-click unsubscribe posts this body to the link.
    const unsubscribed = await SELF.fetch(link, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
    });
    expect(unsubscribed.status).toBe(200);
    expect(await unsubscribedAt("leaver")).not.toBeNull();

    await env.DB.prepare(
        "UPDATE user SET low_balance_notified_at = NULL WHERE id = 'leaver'",
    ).run();
    await processAutoTopUpForUser(notifyEnv, "leaver");
    // Auto top-up still switches off, but without an email.
    await env.DB.prepare(
        "UPDATE user SET auto_top_up_enabled = 1 WHERE id = 'leaver'",
    ).run();
    expect(await processAutoTopUpForUser(notifyEnv, "leaver")).toEqual({
        status: "skipped",
        reason: "missing Stripe customer",
    });
    expect(sent).toHaveLength(1);
});
