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
    fields: {
        packBalance: number;
        lastPackPollen?: number;
        autoTopUp?: boolean;
    },
) {
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, pack_balance, last_pack_pollen, auto_top_up_enabled, auto_top_up_amount_usd)
        VALUES (?, ?, ?, ?, ?, ?, 10)`,
    )
        .bind(
            id,
            id,
            `${id}@example.com`,
            fields.packBalance,
            fields.lastPackPollen ?? null,
            fields.autoTopUp ? 1 : 0,
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

test("running-low email goes out once per pack below 20% of the last pack", async () => {
    const { sent, notifyEnv } = withOutbox();
    // Last pack of 20 Pollen, so the threshold is 4.
    await addUser("low", { packBalance: 3.999, lastPackPollen: 20 });
    await addUser("healthy", { packBalance: 6, lastPackPollen: 20 });
    // Never bought a pack, so there is no threshold.
    await addUser("nopack", { packBalance: 3 });

    for (const id of ["low", "low", "healthy", "nopack"]) {
        expect(await processAutoTopUpForUser(notifyEnv, id)).toEqual({
            status: "skipped",
            reason: "auto top-up disabled",
        });
    }
    expect(sent.map((email) => email.to)).toEqual(["low@example.com"]);
    expect(sent[0].subject).toBe("Your paid balance is running low");
    expect(sent[0].text).toMatch(/^💳 3\.99 pollen left\n/);
    expect(sent[0].text).toContain("\n-- \n");
    expect(sent[0].html).toContain("turn on <strong>auto top-up</strong>");
    expect(sent[0].text).toContain("turn on auto top-up so");
    expect(sent[0].html).toMatch(
        /\/email\/card\.png"[^>]*>3\.99 <span[^>]*>pollen left<\/span>/,
    );

    // Crediting the next pack clears the marker, which re-arms the email.
    await env.DB.prepare(
        "UPDATE user SET low_balance_notified_at = NULL WHERE id = 'low'",
    ).run();
    await processAutoTopUpForUser(notifyEnv, "low");
    expect(sent).toHaveLength(2);
});

test("auto top-up failed emails once per failure", async () => {
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
    expect(sent.map((email) => email.subject)).toEqual(["Auto top-up failed"]);
    expect(sent[0].text).toContain("💳 2.00 pollen left");
    expect(sent[0].text).toContain("for your 10 pollen auto top-up");
    // The reason comes before the balance.
    expect(sent[0].html.indexOf("for your 10 pollen")).toBeLessThan(
        sent[0].html.indexOf("pollen left"),
    );

    // The user turns it back on, and it fails again the same day.
    await env.DB.prepare(
        "UPDATE user SET auto_top_up_enabled = 1 WHERE id = 'nocard'",
    ).run();
    await processAutoTopUpForUser(notifyEnv, "nocard");
    expect(sent.map((email) => email.subject)).toEqual([
        "Auto top-up failed",
        "Auto top-up failed",
    ]);
    // It doesn't use up the running-low email.
    expect(await notifiedAt("nocard")).toBeNull();
});

test("the unsubscribe link stops every email", async () => {
    const { sent, notifyEnv } = withOutbox();
    await addUser("leaver", { packBalance: 3, lastPackPollen: 20 });
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
