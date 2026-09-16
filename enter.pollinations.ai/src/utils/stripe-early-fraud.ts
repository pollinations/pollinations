import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import type Stripe from "stripe";

/**
 * Stripe's dispute fee, flat whatever the charge is worth. A charge smaller
 * than this costs us more in fees than it earned, so refunding an issuer-warned
 * charge under the fee is cheaper than waiting even when the warning is wrong.
 */
export const STRIPE_DISPUTE_FEE_CENTS = 2000;

export type EarlyFraudRefundResult =
    | {
          refunded: true;
          chargeId: string;
          amountCents: number;
          userId: string | null;
      }
    | { refunded: false; reason: string };

/**
 * Refunds a charge an issuer flagged as fraudulent, before it can become a
 * dispute, and reverses the Pollen it bought.
 *
 * Measured on this account: 85% of warnings that were not refunded became a
 * $20 dispute, usually within days. None of the four refunded in time did.
 * Larger charges are left alone: giving away a big payment on one warning is
 * worse than paying the fee if it turns out to be a real customer.
 */
export async function refundEarlyFraudWarning(
    stripe: Stripe,
    db: D1Database,
    warning: Stripe.Radar.EarlyFraudWarning,
): Promise<EarlyFraudRefundResult> {
    const chargeId =
        typeof warning.charge === "string"
            ? warning.charge
            : warning.charge?.id;
    if (!chargeId) return { refunded: false, reason: "no charge on warning" };

    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.status !== "succeeded")
        return { refunded: false, reason: "charge never succeeded" };
    // A retry after a successful run sees the refund and stops here, so the
    // balance is never reversed twice.
    if (charge.refunded || charge.amount_refunded > 0)
        return { refunded: false, reason: "already refunded" };
    if (charge.disputed)
        return { refunded: false, reason: "already disputed, fee is spent" };
    if (charge.amount > STRIPE_DISPUTE_FEE_CENTS)
        return { refunded: false, reason: "above the automatic limit" };

    await stripe.refunds.create(
        { charge: chargeId, reason: "fraudulent" },
        { idempotencyKey: `early-fraud-refund-${warning.id}` },
    );

    // Buyer-controlled fields are not identity; only what our own server wrote.
    const userId =
        charge.metadata?.userId ||
        charge.metadata?.pollinations_user_id ||
        null;
    if (!userId)
        return {
            refunded: true,
            chargeId,
            amountCents: charge.amount,
            userId: null,
        };

    // Packs credit one Pollen per dollar, so the refunded amount reverses
    // directly. This can leave a negative balance when it was already spent.
    const pollen = charge.amount / 100;
    await db
        .prepare(
            `UPDATE user
            SET pack_balance = ROUND(
                COALESCE(pack_balance, 0) - ?,
                ${POLLEN_BILLING_PRECISION}
            )
            WHERE id = ?`,
        )
        .bind(pollen, userId)
        .run();

    return { refunded: true, chargeId, amountCents: charge.amount, userId };
}
