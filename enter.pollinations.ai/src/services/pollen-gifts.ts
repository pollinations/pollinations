import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import {
    generatePollenGiftCode,
    hashPollenGiftCode,
    POLLEN_GIFT_PURPOSE,
} from "@shared/pollen-gifts.ts";
import { calculateServiceFeeCents } from "@shared/pollen-packs.ts";
import type Stripe from "stripe";

export type PollenGiftStatus =
    | "pending"
    | "active"
    | "redeemed"
    | "voided"
    | "refunded"
    | "disputed";

type PollenGiftRow = {
    id: string;
    codeHash: string;
    pollenAmount: number;
    faceValueCents: number;
    serviceFeeCents: number;
    paidAmountCents: number | null;
    paidCurrency: string | null;
    refundedAmountCents: number;
    status: PollenGiftStatus;
    statusBeforeDispute: PollenGiftStatus | null;
    balanceReversed: number;
    stripeCheckoutSessionId: string | null;
    stripePaymentIntentId: string | null;
    redeemerUserId: string | null;
};

export type PollenGiftFulfillmentResult = {
    success: boolean;
    message: string;
    duplicate?: boolean;
    pollenAmount?: number;
};

export function isPollenGiftCheckoutSession(
    session: Stripe.Checkout.Session,
): boolean {
    return session.metadata?.purpose === POLLEN_GIFT_PURPOSE;
}

export async function createPendingPollenGift(
    db: D1Database,
    pollenAmount: number,
): Promise<{
    id: string;
    code: string;
    faceValueCents: number;
    serviceFeeCents: number;
}> {
    const faceValueCents = pollenAmount * 100;
    const serviceFeeCents = calculateServiceFeeCents(faceValueCents);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const id = crypto.randomUUID();
        const code = generatePollenGiftCode();
        const codeHash = await hashPollenGiftCode(code);
        if (!codeHash) throw new Error("Generated an invalid Pollen gift code");

        try {
            await db
                .prepare(
                    `INSERT INTO pollen_gift_code (
                        id,
                        code_hash,
                        pollen_amount,
                        face_value_cents,
                        service_fee_cents,
                        status,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
                )
                .bind(
                    id,
                    codeHash,
                    pollenAmount,
                    faceValueCents,
                    serviceFeeCents,
                    Date.now(),
                )
                .run();

            return { id, code, faceValueCents, serviceFeeCents };
        } catch (error) {
            if (!isUniqueConstraintError(error) || attempt === 2) throw error;
        }
    }

    throw new Error("Failed to generate a unique Pollen gift code");
}

export async function attachPollenGiftCheckoutSession(
    db: D1Database,
    giftId: string,
    checkoutSessionId: string,
): Promise<void> {
    const result = await db
        .prepare(
            `UPDATE pollen_gift_code
             SET stripe_checkout_session_id = ?
             WHERE id = ? AND status = 'pending' AND stripe_checkout_session_id IS NULL`,
        )
        .bind(checkoutSessionId, giftId)
        .run();

    if ((result.meta.changes ?? 0) !== 1) {
        throw new Error(`Could not attach Checkout Session to gift ${giftId}`);
    }
}

export async function voidPendingPollenGift(
    db: D1Database,
    giftId: string,
): Promise<void> {
    await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = 'voided', invalidated_at = ?
             WHERE id = ? AND status = 'pending'`,
        )
        .bind(Date.now(), giftId)
        .run();
}

export async function voidPendingPollenGiftCheckout(
    db: D1Database,
    session: Stripe.Checkout.Session,
): Promise<boolean> {
    if (!isPollenGiftCheckoutSession(session)) return false;
    const giftId = session.metadata?.giftId;
    if (!giftId) return true;

    await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = 'voided', invalidated_at = ?
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status = 'pending'`,
        )
        .bind(Date.now(), giftId, session.id)
        .run();
    return true;
}

export async function fulfillPollenGiftCheckout(
    db: D1Database,
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
): Promise<PollenGiftFulfillmentResult> {
    const giftId = session.metadata?.giftId;
    if (!giftId) {
        return { success: false, message: "Missing gift order metadata" };
    }

    const gift = await loadPollenGiftById(db, giftId);
    if (!gift) {
        return { success: false, message: "Gift order not found" };
    }
    if (gift.stripeCheckoutSessionId !== session.id) {
        return { success: false, message: "Checkout Session mismatch" };
    }
    if (gift.status !== "pending" && gift.status !== "voided") {
        return {
            success: true,
            message: `Gift order already ${gift.status}`,
            duplicate: true,
            pollenAmount: gift.pollenAmount,
        };
    }

    const paymentIntentId = stripeObjectId(session.payment_intent);
    const invoiceId = stripeObjectId(session.invoice);
    const result = await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = 'active',
                 invalidated_at = NULL,
                 paid_amount_cents = ?,
                 paid_currency = ?,
                 stripe_payment_intent_id = ?,
                 stripe_invoice_id = ?,
                 activated_at = ?
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status IN ('pending', 'voided')`,
        )
        .bind(
            session.amount_total ?? null,
            session.currency ?? null,
            paymentIntentId,
            invoiceId,
            event.created ? event.created * 1000 : Date.now(),
            giftId,
            session.id,
        )
        .run();

    if ((result.meta.changes ?? 0) !== 1) {
        const latest = await loadPollenGiftById(db, giftId);
        if (
            latest &&
            latest.status !== "pending" &&
            latest.status !== "voided"
        ) {
            return {
                success: true,
                message: `Gift order already ${latest.status}`,
                duplicate: true,
                pollenAmount: latest.pollenAmount,
            };
        }
        return { success: false, message: "Could not activate gift order" };
    }

    return {
        success: true,
        message: `Activated ${gift.pollenAmount} Pollen gift`,
        pollenAmount: gift.pollenAmount,
    };
}

export async function redeemPollenGift(
    db: D1Database,
    {
        code,
        userId,
    }: {
        code: string;
        userId: string;
    },
): Promise<
    | { redeemed: true; pollenAdded: number; newBalance: number }
    | { redeemed: false }
> {
    const codeHash = await hashPollenGiftCode(code);
    if (!codeHash) return { redeemed: false };

    const gift = await loadPollenGiftByCodeHash(db, codeHash);
    if (!gift || gift.status !== "active") return { redeemed: false };

    const redeemedAt = Date.now();
    const [, creditResult] = await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'redeemed', redeemer_user_id = ?, redeemed_at = ?
                 WHERE id = ?
                   AND status = 'active'
                   AND EXISTS (SELECT 1 FROM user WHERE id = ?)`,
            )
            .bind(userId, redeemedAt, gift.id, userId),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) + ?,
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = ? AND changes() = 1
                 RETURNING pack_balance AS newBalance`,
            )
            .bind(gift.pollenAmount, userId),
    ]);

    const balanceRow = creditResult.results?.[0] as
        | { newBalance?: number }
        | undefined;
    if (typeof balanceRow?.newBalance !== "number") {
        return { redeemed: false };
    }

    return {
        redeemed: true,
        pollenAdded: gift.pollenAmount,
        newBalance: balanceRow.newBalance,
    };
}

export async function recordPollenGiftRefund(
    db: D1Database,
    event: Stripe.Event,
    refund: Stripe.Refund,
): Promise<boolean> {
    const paymentIntentId = stripeObjectId(refund.payment_intent);
    if (!paymentIntentId) return false;
    const gift = await loadPollenGiftByPaymentIntent(db, paymentIntentId);
    if (!gift) return false;
    if (refund.status !== "succeeded") return true;
    if (gift.paidCurrency && refund.currency !== gift.paidCurrency) {
        console.error(`Refund currency mismatch for Pollen gift ${gift.id}`);
        return true;
    }

    const [recordResult] = await db.batch([
        db
            .prepare(
                `INSERT OR IGNORE INTO pollen_gift_adjustment (
                    idempotency_key,
                    gift_id,
                    stripe_event_id,
                    user_id,
                    pollen_delta,
                    amount_cents,
                    reason,
                    created_at
                ) VALUES (?, ?, ?, NULL, 0, ?, 'refund_recorded', ?)`,
            )
            .bind(
                `refund:${refund.id}`,
                gift.id,
                event.id,
                refund.amount,
                Date.now(),
            ),
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET refunded_amount_cents = refunded_amount_cents + ?
                 WHERE id = ? AND changes() = 1`,
            )
            .bind(refund.amount, gift.id),
    ]);

    if ((recordResult.meta.changes ?? 0) !== 1) return true;
    const latest = await loadPollenGiftById(db, gift.id);
    if (
        latest?.paidAmountCents &&
        latest.refundedAmountCents >= latest.paidAmountCents
    ) {
        await invalidateGiftForPaymentLoss(db, latest, {
            idempotencyKey: `refund-full:${latest.id}`,
            stripeEventId: event.id,
            reason: "refund",
        });
    }
    return true;
}

export async function handlePollenGiftDispute(
    db: D1Database,
    event: Stripe.Event,
    dispute: Stripe.Dispute,
): Promise<boolean> {
    const paymentIntentId = stripeObjectId(dispute.payment_intent);
    if (!paymentIntentId) return false;
    const gift = await loadPollenGiftByPaymentIntent(db, paymentIntentId);
    if (!gift) return false;

    if (event.type === "charge.dispute.created") {
        await disputePollenGift(db, gift, dispute, event.id);
        return true;
    }
    if (event.type !== "charge.dispute.closed") return true;

    if (dispute.status === "won") {
        await restorePollenGiftAfterWonDispute(db, gift, dispute, event.id);
    } else {
        await invalidateGiftForPaymentLoss(db, gift, {
            idempotencyKey: `dispute-lost:${dispute.id}`,
            stripeEventId: event.id,
            reason: "dispute_lost",
        });
    }
    return true;
}

async function disputePollenGift(
    db: D1Database,
    gift: PollenGiftRow,
    dispute: Stripe.Dispute,
    stripeEventId: string,
): Promise<void> {
    if (gift.status === "active") {
        const result = await db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'disputed',
                     status_before_dispute = 'active',
                     invalidated_at = ?
                 WHERE id = ? AND status = 'active'`,
            )
            .bind(Date.now(), gift.id)
            .run();
        if ((result.meta.changes ?? 0) === 0) {
            const latest = await loadPollenGiftById(db, gift.id);
            if (latest && latest.status !== gift.status) {
                await disputePollenGift(db, latest, dispute, stripeEventId);
            }
        }
        return;
    }
    if (
        gift.status !== "redeemed" ||
        gift.balanceReversed ||
        !gift.redeemerUserId
    ) {
        return;
    }

    const [giftUpdate] = await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'disputed',
                     status_before_dispute = 'redeemed',
                     balance_reversed = 1,
                     invalidated_at = ?
                 WHERE id = ? AND status = 'redeemed' AND balance_reversed = 0`,
            )
            .bind(Date.now(), gift.id),
        db
            .prepare(
                `INSERT OR IGNORE INTO pollen_gift_adjustment (
                    idempotency_key, gift_id, stripe_event_id, user_id,
                    pollen_delta, amount_cents, reason, created_at
                 ) SELECT ?, ?, ?, ?, ?, 0, 'dispute', ?
                 WHERE changes() = 1`,
            )
            .bind(
                `dispute:${dispute.id}`,
                gift.id,
                stripeEventId,
                gift.redeemerUserId,
                -gift.pollenAmount,
                Date.now(),
            ),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) - ?,
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = ? AND changes() = 1`,
            )
            .bind(gift.pollenAmount, gift.redeemerUserId),
    ]);
    if ((giftUpdate.meta.changes ?? 0) === 0) {
        const latest = await loadPollenGiftById(db, gift.id);
        if (latest && latest.status !== gift.status) {
            await disputePollenGift(db, latest, dispute, stripeEventId);
        }
    }
}

async function restorePollenGiftAfterWonDispute(
    db: D1Database,
    gift: PollenGiftRow,
    dispute: Stripe.Dispute,
    stripeEventId: string,
): Promise<void> {
    if (gift.status !== "disputed") return;
    if (gift.statusBeforeDispute === "active") {
        await db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'active',
                     status_before_dispute = NULL,
                     invalidated_at = NULL
                 WHERE id = ? AND status = 'disputed'`,
            )
            .bind(gift.id)
            .run();
        return;
    }
    if (
        gift.statusBeforeDispute !== "redeemed" ||
        !gift.balanceReversed ||
        !gift.redeemerUserId
    ) {
        return;
    }

    await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'redeemed',
                     status_before_dispute = NULL,
                     balance_reversed = 0,
                     invalidated_at = NULL
                 WHERE id = ? AND status = 'disputed' AND balance_reversed = 1`,
            )
            .bind(gift.id),
        db
            .prepare(
                `INSERT OR IGNORE INTO pollen_gift_adjustment (
                    idempotency_key, gift_id, stripe_event_id, user_id,
                    pollen_delta, amount_cents, reason, created_at
                 ) SELECT ?, ?, ?, ?, ?, 0, 'dispute_won', ?
                 WHERE changes() = 1`,
            )
            .bind(
                `dispute-won:${dispute.id}`,
                gift.id,
                stripeEventId,
                gift.redeemerUserId,
                gift.pollenAmount,
                Date.now(),
            ),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) + ?,
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = ? AND changes() = 1`,
            )
            .bind(gift.pollenAmount, gift.redeemerUserId),
    ]);
}

async function invalidateGiftForPaymentLoss(
    db: D1Database,
    gift: PollenGiftRow,
    {
        idempotencyKey,
        stripeEventId,
        reason,
    }: {
        idempotencyKey: string;
        stripeEventId: string;
        reason: string;
    },
): Promise<void> {
    if (gift.status === "active" || gift.status === "pending") {
        const result = await db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'refunded', invalidated_at = ?
                 WHERE id = ? AND status IN ('active', 'pending')`,
            )
            .bind(Date.now(), gift.id)
            .run();
        if ((result.meta.changes ?? 0) === 0) {
            await retryPaymentLossAfterRace(db, gift, {
                idempotencyKey,
                stripeEventId,
                reason,
            });
        }
        return;
    }
    if (gift.status === "disputed") {
        const result = await db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'refunded', invalidated_at = ?
                 WHERE id = ? AND status = 'disputed'`,
            )
            .bind(Date.now(), gift.id)
            .run();
        if ((result.meta.changes ?? 0) === 0) {
            await retryPaymentLossAfterRace(db, gift, {
                idempotencyKey,
                stripeEventId,
                reason,
            });
        }
        return;
    }
    if (
        gift.status !== "redeemed" ||
        gift.balanceReversed ||
        !gift.redeemerUserId
    ) {
        return;
    }

    const [giftUpdate] = await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'refunded', balance_reversed = 1, invalidated_at = ?
                 WHERE id = ? AND status = 'redeemed' AND balance_reversed = 0`,
            )
            .bind(Date.now(), gift.id),
        db
            .prepare(
                `INSERT OR IGNORE INTO pollen_gift_adjustment (
                    idempotency_key, gift_id, stripe_event_id, user_id,
                    pollen_delta, amount_cents, reason, created_at
                 ) SELECT ?, ?, ?, ?, ?, 0, ?, ?
                 WHERE changes() = 1`,
            )
            .bind(
                idempotencyKey,
                gift.id,
                stripeEventId,
                gift.redeemerUserId,
                -gift.pollenAmount,
                reason,
                Date.now(),
            ),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) - ?,
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = ? AND changes() = 1`,
            )
            .bind(gift.pollenAmount, gift.redeemerUserId),
    ]);
    if ((giftUpdate.meta.changes ?? 0) === 0) {
        await retryPaymentLossAfterRace(db, gift, {
            idempotencyKey,
            stripeEventId,
            reason,
        });
    }
}

async function retryPaymentLossAfterRace(
    db: D1Database,
    previous: PollenGiftRow,
    input: {
        idempotencyKey: string;
        stripeEventId: string;
        reason: string;
    },
): Promise<void> {
    const latest = await loadPollenGiftById(db, previous.id);
    if (latest && latest.status !== previous.status) {
        await invalidateGiftForPaymentLoss(db, latest, input);
    }
}

async function loadPollenGiftById(
    db: D1Database,
    id: string,
): Promise<PollenGiftRow | null> {
    return await db
        .prepare(`${POLLEN_GIFT_SELECT} WHERE id = ?`)
        .bind(id)
        .first<PollenGiftRow>();
}

async function loadPollenGiftByCodeHash(
    db: D1Database,
    codeHash: string,
): Promise<PollenGiftRow | null> {
    return await db
        .prepare(`${POLLEN_GIFT_SELECT} WHERE code_hash = ?`)
        .bind(codeHash)
        .first<PollenGiftRow>();
}

async function loadPollenGiftByPaymentIntent(
    db: D1Database,
    paymentIntentId: string,
): Promise<PollenGiftRow | null> {
    return await db
        .prepare(`${POLLEN_GIFT_SELECT} WHERE stripe_payment_intent_id = ?`)
        .bind(paymentIntentId)
        .first<PollenGiftRow>();
}

const POLLEN_GIFT_SELECT = `SELECT
    id,
    code_hash AS codeHash,
    pollen_amount AS pollenAmount,
    face_value_cents AS faceValueCents,
    service_fee_cents AS serviceFeeCents,
    paid_amount_cents AS paidAmountCents,
    paid_currency AS paidCurrency,
    refunded_amount_cents AS refundedAmountCents,
    status,
    status_before_dispute AS statusBeforeDispute,
    balance_reversed AS balanceReversed,
    stripe_checkout_session_id AS stripeCheckoutSessionId,
    stripe_payment_intent_id AS stripePaymentIntentId,
    redeemer_user_id AS redeemerUserId
FROM pollen_gift_code`;

function stripeObjectId(value: { id: string } | string | null): string | null {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

function isUniqueConstraintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("UNIQUE constraint failed");
}
