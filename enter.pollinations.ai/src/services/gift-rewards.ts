import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards, user } from "@shared/db/better-auth.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type Stripe from "stripe";

export async function hashGiftCode(code: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(code.trim().toLowerCase()),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}

export async function recordGiftReward(
    database: D1Database,
    session: Stripe.Checkout.Session,
) {
    const code = session.metadata?.giftCode;
    const pack = getPollenPackByKey(session.metadata?.packKey ?? "");
    const paymentIntent = session.payment_intent;
    if (session.payment_status !== "paid" || !code || !pack || !paymentIntent) {
        throw new Error("Gift checkout is not paid or is missing metadata");
    }
    return recordRewards(drizzle(database, { schema }), [
        {
            idempotencyKey: `stripe-gift:${typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id}`,
            userId: null,
            giftCodeHash: await hashGiftCode(code),
            amount: pack.amountUsd,
            bucket: "pack",
            title: "Pollen gift",
        },
    ]);
}

// Any successful refund voids the gift. As in the original MVP, partial refunds
// void the whole code; disputes and refunds preceding fulfillment are manual.
export async function refundGiftReward(
    database: D1Database,
    paymentIntentId: string,
) {
    const db = drizzle(database, { schema });
    const gift = and(
        eq(rewards.idempotencyKey, `stripe-gift:${paymentIntentId}`),
        isNotNull(rewards.giftCodeHash),
        isNull(rewards.canceledAt),
    );
    // Both statements run in one transaction. Read the recipient here, not
    // before the transaction, so a concurrent claim cannot escape the refund.
    await db.batch([
        db
            .update(user)
            .set({
                packBalance: sql`ROUND(COALESCE(${user.packBalance}, 0) - (${db.select({ amount: rewards.pollenAmount }).from(rewards).where(gift)}), ${POLLEN_BILLING_PRECISION})`,
            })
            .where(
                eq(
                    user.id,
                    db
                        .select({ userId: rewards.userId })
                        .from(rewards)
                        .where(and(gift, isNotNull(rewards.claimedAt))),
                ),
            ),
        db.update(rewards).set({ canceledAt: new Date() }).where(gift),
    ]);
}
