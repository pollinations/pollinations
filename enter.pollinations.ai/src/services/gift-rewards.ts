import { recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
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
