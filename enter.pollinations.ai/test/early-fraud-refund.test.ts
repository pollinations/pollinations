import { env } from "cloudflare:test";
import Stripe from "stripe";
import { expect } from "vitest";
import {
    refundEarlyFraudWarning,
    STRIPE_DISPUTE_FEE_CENTS,
} from "../src/utils/stripe-early-fraud.ts";
import { test } from "./fixtures.ts";

const client = () => new Stripe("sk_test_mock", { maxNetworkRetries: 0 });
const warning = (charge: string) =>
    ({
        id: `issfr_${charge}`,
        object: "radar.early_fraud_warning",
        charge,
    }) as unknown as Stripe.Radar.EarlyFraudWarning;

async function balanceOf(userId: string) {
    const row = await env.DB.prepare(
        "SELECT pack_balance FROM user WHERE id = ?",
    )
        .bind(userId)
        .first<{ pack_balance: number | null }>();
    return Number(row?.pack_balance ?? 0);
}

test("a warned charge under the dispute fee is refunded and its pollen reversed", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    await env.DB.prepare("UPDATE user SET pack_balance = 5 WHERE id = ?")
        .bind(user.id)
        .run();
    mocks.stripe.state.fraudCharges.push({
        id: "ch_small",
        object: "charge",
        livemode: true,
        status: "succeeded",
        amount: 200,
        amount_refunded: 0,
        refunded: false,
        disputed: false,
        metadata: { userId: user.id },
    });

    const result = await refundEarlyFraudWarning(
        client(),
        env.DB,
        warning("ch_small"),
    );

    expect(result).toMatchObject({ refunded: true, userId: user.id });
    expect(mocks.stripe.state.refunds).toHaveLength(1);
    expect(mocks.stripe.state.refunds[0]).toMatchObject({
        charge: "ch_small",
        reason: "fraudulent",
    });
    // $2.00 charge reverses two pollen.
    expect(await balanceOf(user.id)).toBe(3);
});

test("reversal is not repeated when Stripe retries the same warning", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    await env.DB.prepare("UPDATE user SET pack_balance = 5 WHERE id = ?")
        .bind(user.id)
        .run();
    mocks.stripe.state.fraudCharges.push({
        id: "ch_retry",
        object: "charge",
        livemode: true,
        status: "succeeded",
        amount: 200,
        amount_refunded: 0,
        refunded: false,
        disputed: false,
        metadata: { userId: user.id },
    });
    const stripe = client();

    await refundEarlyFraudWarning(stripe, env.DB, warning("ch_retry"));
    const afterFirst = await balanceOf(user.id);
    const replay = await refundEarlyFraudWarning(
        stripe,
        env.DB,
        warning("ch_retry"),
    );

    expect(replay).toEqual({ refunded: false, reason: "already refunded" });
    expect(mocks.stripe.state.refunds).toHaveLength(1);
    expect(await balanceOf(user.id)).toBe(afterFirst);
});

test("a charge worth more than the fee is left for a person to judge", async ({
    sessionToken,
    mocks,
}) => {
    expect(sessionToken).toBeTruthy();
    await mocks.enable("stripe");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw Error("Missing user");
    await env.DB.prepare("UPDATE user SET pack_balance = 200 WHERE id = ?")
        .bind(user.id)
        .run();
    mocks.stripe.state.fraudCharges.push({
        id: "ch_large",
        object: "charge",
        livemode: true,
        status: "succeeded",
        amount: STRIPE_DISPUTE_FEE_CENTS + 1,
        amount_refunded: 0,
        refunded: false,
        disputed: false,
        metadata: { userId: user.id },
    });

    const result = await refundEarlyFraudWarning(
        client(),
        env.DB,
        warning("ch_large"),
    );

    expect(result).toEqual({
        refunded: false,
        reason: "above the automatic limit",
    });
    expect(mocks.stripe.state.refunds).toHaveLength(0);
    expect(await balanceOf(user.id)).toBe(200);
});

test("an already disputed charge is left alone; the fee is already spent", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    mocks.stripe.state.fraudCharges.push({
        id: "ch_disputed",
        object: "charge",
        livemode: true,
        status: "succeeded",
        amount: 200,
        amount_refunded: 0,
        refunded: false,
        disputed: true,
        metadata: {},
    });

    expect(
        await refundEarlyFraudWarning(client(), env.DB, warning("ch_disputed")),
    ).toEqual({
        refunded: false,
        reason: "already disputed, fee is spent",
    });
    expect(mocks.stripe.state.refunds).toHaveLength(0);
});

test("a charge with no server-written owner is still refunded", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    mocks.stripe.state.fraudCharges.push({
        id: "ch_guest",
        object: "charge",
        livemode: true,
        status: "succeeded",
        amount: 1000,
        amount_refunded: 0,
        refunded: false,
        disputed: false,
        // Buyer email is not identity, so no balance can be reversed.
        billing_details: { email: "buyer@example.com" },
        metadata: {},
    });

    expect(
        await refundEarlyFraudWarning(client(), env.DB, warning("ch_guest")),
    ).toMatchObject({ refunded: true, userId: null });
    expect(mocks.stripe.state.refunds).toHaveLength(1);
});
