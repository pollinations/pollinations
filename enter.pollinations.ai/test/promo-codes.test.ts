import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const baseUrl = "http://localhost:3000/api";

const inOneDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function createCode(body: Record<string, unknown>) {
    return SELF.fetch(`${baseUrl}/admin/promo-codes`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

async function redeem(token: string, code: string) {
    return SELF.fetch(`${baseUrl}/account/promo-codes/redeem`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
    });
}

test("an event code credits Quest Pollen once per account", async ({
    accountToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const [before] = await db
        .select({ id: schema.user.id, tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .limit(1);

    const created = await createCode({
        eventId: "talk-berlin-2026-10",
        title: "Berlin AI meetup",
        pollenAmount: 3,
        expiresAt: inOneDay(),
    });
    expect(created.status).toBe(200);
    const { code } = (await created.json()) as { code: string };
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    // Codes are typed by hand, so case and separators don't matter.
    const first = await redeem(
        accountToken,
        ` ${code.replace("-", "").toLowerCase()} `,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
        eventId: "talk-berlin-2026-10",
        pollenAmount: 3,
        claimed: true,
        newBalance: (before?.tierBalance ?? 0) + 3,
    });

    const second = await redeem(accountToken, code);
    expect(second.status).toBe(409);

    const ledger = await db
        .select()
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "promo:talk-berlin-2026-10"));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
        userId: before?.id,
        title: "Berlin AI meetup",
        pollenAmount: 3,
        balanceBucket: "tier",
    });
    expect(ledger[0]?.claimedAt).not.toBeNull();

    const [after] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, before?.id ?? ""));
    expect(after?.tierBalance).toBe((before?.tierBalance ?? 0) + 3);
});

test("unknown and expired codes are rejected the same way", async ({
    accountToken,
}) => {
    // KV usually drops expired codes; the expiry check covers its lag.
    await env.KV.put(
        "promo-code:EXPIRED1",
        JSON.stringify({
            eventId: "old-talk",
            title: "Old talk",
            pollenAmount: 3,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
    );

    for (const code of ["EXPIRED1", "NOPE-NOPE"]) {
        const response = await redeem(accountToken, code);
        expect(response.status).toBe(404);
        expect(await response.text()).toContain(
            "This code is invalid or has expired",
        );
    }
    const db = drizzle(env.DB, { schema });
    expect(
        await db
            .select()
            .from(schema.rewards)
            .where(eq(schema.rewards.questId, "promo:old-talk")),
    ).toHaveLength(0);
});

test("codes can't be redeemed with an API key", async ({ apiKey }) => {
    const created = await createCode({
        eventId: "talk-api-key",
        title: "Talk",
        pollenAmount: 1,
        expiresAt: inOneDay(),
    });
    const { code } = (await created.json()) as { code: string };
    expect((await redeem(apiKey, code)).status).toBe(403);
});

test("redeeming requires sign-in", async () => {
    const response = await SELF.fetch(`${baseUrl}/account/promo-codes/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABCD-EFGH" }),
    });
    expect(response.status).toBe(401);
});

test("creating a code needs the admin token and a short expiry", async () => {
    const unauthorized = await SELF.fetch(`${baseUrl}/admin/promo-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    expect(unauthorized.status).toBe(401);

    const tooLong = await createCode({
        eventId: "talk-forever",
        title: "Talk",
        pollenAmount: 3,
        expiresAt: new Date(
            Date.now() + 31 * 24 * 60 * 60 * 1000,
        ).toISOString(),
    });
    expect(tooLong.status).toBe(400);

    const inThePast = await createCode({
        eventId: "talk-past",
        title: "Talk",
        pollenAmount: 3,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(inThePast.status).toBe(400);
});
