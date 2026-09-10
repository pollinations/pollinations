import { env, SELF } from "cloudflare:test";
import { isBannedLoginError } from "@shared/auth/ban.ts";
import * as schema from "@shared/db/better-auth.ts";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import {
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "../src/utils/stripe-billing/auto-top-up.ts";
import {
    getStripeNewCardGateStatus,
    recordStripeCardFingerprintAttempt,
} from "../src/utils/stripe-card-gate.ts";
import { banFraudAccount } from "../src/utils/stripe-fraud-ban.ts";
import { test } from "./fixtures.ts";

test("checkout created during a ban is expired instead of redirected", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const db = drizzle(env.DB, { schema });
    const user = await db.query.user.findFirst();
    if (!user) throw Error("Missing fixture user");
    mocks.stripe.state.onCheckoutSessionCreated = () =>
        banFraudAccount(env.DB, user.id);
    const response = await SELF.fetch(
        "http://localhost:3000/api/stripe/checkout/p10",
        {
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
            redirect: "manual",
        },
    );
    expect(response.status).toBe(403);
    expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
    expect(mocks.stripe.state.checkoutSessions[0].status).toBe("expired");
});

test("ban page recognizes the installed library error code", () => {
    expect(isBannedLoginError(admin().$ERROR_CODES.BANNED_USER.code)).toBe(
        true,
    );
    expect(isBannedLoginError("banned")).toBe(true);
    expect(isBannedLoginError("unknown")).toBe(false);
});

test("four-card Radar stays independent from account bans", async ({
    sessionToken,
}) => {
    expect(sessionToken).toBeTruthy();
    const db = drizzle(env.DB, { schema });
    const user = await db.query.user.findFirst();
    if (!user) throw Error("Missing fixture user");
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
        await recordStripeCardFingerprintAttempt(env.DB, {
            userId: user.id,
            eventId: `evt_${i}`,
            cardFingerprint: `fp_${i % 7}`,
            createdAt: now,
        });
        if (i === 3)
            expect(
                await getStripeNewCardGateStatus(env.DB, user.id, now),
            ).toMatchObject({ gate: "locked" });
    }
    expect((await getStripeNewCardGateStatus(env.DB, user.id, now)).gate).toBe(
        "locked",
    );
    expect(
        (await getStripeNewCardGateStatus(env.DB, user.id, now - 1)).gate,
    ).toBe("ok");
    expect(
        (await getStripeNewCardGateStatus(env.DB, user.id, now + 86400001))
            .gate,
    ).toBe("ok");
    await db.delete(schema.stripeCardFingerprintAttempt);
    for (let i = 0; i < 8; i++)
        await recordStripeCardFingerprintAttempt(env.DB, {
            userId: user.id,
            eventId: `card_${i}`,
            cardFingerprint: `card_${i}`,
            createdAt: now,
        });
    expect((await getStripeNewCardGateStatus(env.DB, user.id, now)).gate).toBe(
        "locked",
    );
    expect((await db.query.user.findFirst())?.banned).not.toBe(true);
});

test("fraud ban revokes sessions, stops automatic payments, and rejects existing keys", async ({
    sessionToken,
    apiKey,
    pubApiKey,
}) => {
    const db = drizzle(env.DB, { schema });
    const user = await db.query.user.findFirst();
    if (!user) throw Error("Missing fixture user");
    await db
        .update(schema.user)
        .set({ autoTopUpEnabled: true })
        .where(eq(schema.user.id, user.id));
    await banFraudAccount(env.DB, user.id);
    await banFraudAccount(env.DB, user.id);
    expect(await db.query.user.findFirst()).toMatchObject({
        banned: true,
        banExpires: null,
        autoTopUpEnabled: false,
    });
    expect(
        await db.query.session.findMany({
            where: eq(schema.session.userId, user.id),
        }),
    ).toHaveLength(0);
    expect(await processAutoTopUpForUser(env, user.id)).toEqual({
        status: "skipped",
        reason: "account restricted",
    });
    expect(
        await updateAutoTopUpSettings(env, user.id, {
            enabled: true,
            packAmountUsd: 10,
        }),
    ).toMatchObject({ ok: false, status: 403 });
    for (const key of [apiKey, pubApiKey]) {
        const result = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${key}` } },
        );
        expect(result.status).toBe(403);
    }
    const lookup = await SELF.fetch(
        `http://localhost:3000/api/app-lookup?app_key=${encodeURIComponent(pubApiKey)}`,
    );
    expect(await lookup.json()).toMatchObject({ found: false });
    const checkout = await SELF.fetch(
        "http://localhost:3000/api/stripe/checkout/p10",
        {
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
            redirect: "manual",
        },
    );
    expect(checkout.status).toBe(401);
});

test("banned login reaches the restricted error screen", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("github");
    expect(sessionToken).toBeTruthy();
    const db = drizzle(env.DB, { schema });
    const user = await db.query.user.findFirst();
    if (!user) throw Error("Missing fixture user");
    await banFraudAccount(env.DB, user.id);
    const start = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "github" }),
        },
    );
    const data = (await start.json()) as { url: string };
    const state = new URL(data.url).searchParams.get("state");
    const result = await SELF.fetch(
        `http://localhost:3000/api/auth/callback/github?code=test-code&state=${state}`,
        {
            headers: {
                Cookie: start.headers.get("Set-Cookie") ?? "",
                Accept: "text/html",
            },
            redirect: "manual",
        },
    );
    expect(result.status).toBe(302);
    const location = new URL(
        result.headers.get("Location") ?? "",
        "http://localhost:3000",
    );
    expect(location.pathname).toBe("/error");
    expect(location.searchParams.get("error")).toBe("BANNED_USER");
    expect(isBannedLoginError(location.searchParams.get("error") ?? "")).toBe(
        true,
    );
});
