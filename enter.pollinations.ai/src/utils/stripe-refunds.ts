import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import type Stripe from "stripe";

type PurchaseCredit = { userId: string; pollen: number };

async function findPurchaseCredit(
    db: D1Database,
    stripe: Stripe,
    paymentIntent: string,
): Promise<PurchaseCredit> {
    for await (const session of stripe.checkout.sessions.list({
        payment_intent: paymentIntent,
        limit: 100,
    })) {
        const credit = await db
            .prepare(
                "SELECT user_id AS userId, pollen_credited AS pollen FROM stripe_checkout_credits WHERE session_id = ?",
            )
            .bind(session.id)
            .first<PurchaseCredit>();
        if (!credit)
            throw new Error(`Refund purchase not credited: ${session.id}`);
        return credit;
    }
    for await (const payment of stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntent },
        status: "paid",
        limit: 100,
    })) {
        const invoiceId =
            typeof payment.invoice === "string"
                ? payment.invoice
                : payment.invoice.id;
        const credit = await db
            .prepare(
                "SELECT user_id AS userId, amount_usd AS pollen FROM stripe_auto_top_up_attempt WHERE stripe_invoice_id = ? AND status = 'paid'",
            )
            .bind(invoiceId)
            .first<PurchaseCredit>();
        if (!credit)
            throw new Error(`Refund invoice not credited: ${invoiceId}`);
        return credit;
    }
    throw new Error(
        `No purchase credit for refunded payment: ${paymentIntent}`,
    );
}

/** Await the money adjustment so Stripe retries failed or out-of-order fulfillment. */
export async function reverseStripeRefund(
    db: D1Database,
    stripe: Stripe,
    refundId: string,
    livemode: boolean,
): Promise<void> {
    // Event snapshots can arrive out of order (pending after succeeded).
    const refund = await stripe.refunds.retrieve(refundId);
    if (
        !refund.status ||
        !["succeeded", "failed", "canceled"].includes(refund.status)
    )
        return;
    const recorded = await db
        .prepare("SELECT status FROM stripe_refund WHERE refund_id = ?")
        .bind(refund.id)
        .first<{ status: string }>();
    if (
        recorded &&
        (refund.status === "succeeded" || recorded.status !== "succeeded")
    )
        return;
    const chargeId =
        typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
    if (!chargeId) throw new Error(`Refund has no charge: ${refund.id}`);
    const charge = await stripe.charges.retrieve(chargeId);
    const paymentIntent =
        typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
    if (
        !paymentIntent ||
        charge.livemode !== livemode ||
        !charge.captured ||
        charge.amount_captured <= 0 ||
        refund.currency !== charge.currency ||
        refund.amount <= 0 ||
        refund.amount > charge.amount_captured
    ) {
        throw new Error(`Invalid refunded payment: ${charge.id}`);
    }
    const credit = await findPurchaseCredit(db, stripe, paymentIntent);
    for (const owner of [
        charge.metadata?.userId,
        charge.metadata?.pollinations_user_id,
    ]) {
        if (owner && owner !== credit.userId)
            throw new Error(`Refund owner mismatch: ${charge.id}`);
    }
    if (refund.status !== "succeeded") {
        // Banks can return an already-issued refund. Restore only its recorded
        // deduction, once; a terminal row also prevents an in-flight success
        // handler from applying a stale deduction after the failure commits.
        await db.batch([
            db
                .prepare(`UPDATE user SET pack_balance = ROUND(
                COALESCE(pack_balance, 0) + COALESCE((SELECT pollen_reversed
                    FROM stripe_refund WHERE refund_id = ? AND status = 'succeeded'), 0),
                ${POLLEN_BILLING_PRECISION}) WHERE id = ?`)
                .bind(refund.id, credit.userId),
            db
                .prepare(`INSERT INTO stripe_refund
                (refund_id, status, charge_id, payment_intent_id, user_id, amount, currency, pollen_reversed)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(refund_id) DO UPDATE SET status = excluded.status`)
                .bind(
                    refund.id,
                    refund.status,
                    charge.id,
                    paymentIntent,
                    credit.userId,
                    refund.amount,
                    refund.currency,
                ),
        ]);
        return;
    }
    // The insert and debit commit together. A duplicate refund ID rolls back the
    // whole batch. Cumulative rounding makes the final partial refund remove
    // exactly the original grant, including with tax, fees or localized prices.
    try {
        await db.batch([
            db
                .prepare(`INSERT INTO stripe_refund
                (refund_id, status, charge_id, payment_intent_id, user_id, amount, currency, pollen_reversed)
                SELECT ?, 'succeeded', ?, ?, ?, ?, ?,
                    ROUND(? * (? + COALESCE(SUM(amount), 0)) / ?, ${POLLEN_BILLING_PRECISION})
                        - COALESCE(SUM(pollen_reversed), 0)
                FROM stripe_refund WHERE charge_id = ? AND status = 'succeeded'`)
                .bind(
                    refund.id,
                    charge.id,
                    paymentIntent,
                    credit.userId,
                    refund.amount,
                    refund.currency,
                    credit.pollen,
                    refund.amount,
                    charge.amount_captured,
                    charge.id,
                ),
            db
                .prepare(`UPDATE user SET pack_balance = ROUND(
                    COALESCE(pack_balance, 0) - (SELECT pollen_reversed FROM stripe_refund WHERE refund_id = ?),
                    ${POLLEN_BILLING_PRECISION}) WHERE id = ?`)
                .bind(refund.id, credit.userId),
        ]);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.includes(
                "UNIQUE constraint failed: stripe_refund.refund_id",
            )
        )
            return;
        throw error;
    }
}
