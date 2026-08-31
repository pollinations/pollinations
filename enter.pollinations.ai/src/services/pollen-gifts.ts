import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import {
    generatePollenGiftCode,
    hashPollenGiftCode,
    POLLEN_GIFT_PURPOSE,
} from "@shared/pollen-gifts.ts";
import { calculateServiceFeeCents } from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { isUniqueConstraintError } from "../utils/d1.ts";
import { getStripeId } from "../utils/stripe.ts";

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
    status: PollenGiftStatus;
    statusBeforePaymentLoss: PollenGiftStatus | null;
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
    presentmentCurrency?: string;
    presentmentAmount?: number;
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
                        status,
                        created_at
                    ) VALUES (?, ?, ?, 'pending', ?)`,
                )
                .bind(id, codeHash, pollenAmount, Date.now())
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
             SET status = 'voided'
             WHERE id = ? AND status = 'pending'`,
        )
        .bind(giftId)
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
             SET status = 'voided'
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status = 'pending'`,
        )
        .bind(giftId, session.id)
        .run();
    return true;
}

export async function fulfillPollenGiftCheckout(
    db: D1Database,
    session: Stripe.Checkout.Session,
): Promise<PollenGiftFulfillmentResult> {
    const giftId = session.metadata?.giftId;
    if (!giftId) {
        return { success: false, message: "Missing gift order metadata" };
    }

    const paymentIntentId = getStripeId(session.payment_intent);
    const presentment = readPollenGiftPresentment(session);
    const activated = await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = 'active',
                 stripe_payment_intent_id = ?
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status IN ('pending', 'voided')
             RETURNING pollen_amount AS pollenAmount`,
        )
        .bind(paymentIntentId, giftId, session.id)
        .first<{ pollenAmount: number }>();

    if (activated) {
        return {
            success: true,
            message: `Activated ${activated.pollenAmount} Pollen gift`,
            duplicate: false,
            pollenAmount: activated.pollenAmount,
            presentmentCurrency: presentment.presentmentCurrency,
            presentmentAmount: presentment.presentmentAmount,
        };
    }

    const latest = await loadPollenGiftById(db, giftId);
    if (!latest) return { success: false, message: "Gift order not found" };
    if (latest.stripeCheckoutSessionId !== session.id) {
        return { success: false, message: "Checkout Session mismatch" };
    }
    return {
        success: true,
        message: `Gift order already ${latest.status}`,
        duplicate: true,
        pollenAmount: latest.pollenAmount,
        presentmentCurrency: presentment.presentmentCurrency,
        presentmentAmount: presentment.presentmentAmount,
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
    giftIdHint?: string,
): Promise<boolean> {
    const paymentIntentId = getStripeId(refund.payment_intent);
    if (!paymentIntentId) return false;
    const gift = await resolvePollenGiftForPaymentEvent(
        db,
        paymentIntentId,
        giftIdHint,
    );
    if (!gift) return false;

    if (refund.status !== "succeeded" && refund.status !== "failed") {
        return true;
    }
    await setPollenGiftPaymentLoss(db, gift.id, {
        idempotencyKey: `refund:${refund.id}`,
        stripeEventCreated: event.created,
        reason: "refund",
        active: refund.status === "succeeded",
        terminal: refund.status === "failed",
    });
    await reconcilePollenGiftPaymentLoss(db, gift.id);
    return true;
}

export async function handlePollenGiftDispute(
    db: D1Database,
    event: Stripe.Event,
    dispute: Stripe.Dispute,
    giftIdHint?: string,
): Promise<boolean> {
    const paymentIntentId = getStripeId(dispute.payment_intent);
    if (!paymentIntentId) return false;
    const gift = await resolvePollenGiftForPaymentEvent(
        db,
        paymentIntentId,
        giftIdHint,
    );
    if (!gift) return false;
    const loss = disputePaymentLoss(event.type, dispute.status);
    if (!loss) return true;

    await setPollenGiftPaymentLoss(db, gift.id, {
        idempotencyKey: `dispute:${dispute.id}`,
        stripeEventCreated: event.created,
        reason: "dispute",
        ...loss,
    });
    await reconcilePollenGiftPaymentLoss(db, gift.id);
    return true;
}

type PaymentLossReason = "refund" | "dispute";

type PaymentLossState = {
    active: boolean;
    terminal: boolean;
};

function disputePaymentLoss(
    eventType: string,
    status: Stripe.Dispute.Status,
): PaymentLossState | null {
    if (eventType === "charge.dispute.funds_withdrawn") {
        return { active: true, terminal: false };
    }
    if (eventType === "charge.dispute.funds_reinstated") {
        return { active: false, terminal: true };
    }
    if (eventType === "charge.dispute.closed") {
        return { active: status === "lost", terminal: true };
    }
    if (
        eventType !== "charge.dispute.created" &&
        eventType !== "charge.dispute.updated"
    ) {
        return null;
    }

    if (
        status === "warning_needs_response" ||
        status === "warning_under_review"
    ) {
        return { active: false, terminal: false };
    }
    if (
        status === "warning_closed" ||
        status === "won" ||
        status === "prevented"
    ) {
        return { active: false, terminal: true };
    }
    return { active: true, terminal: status === "lost" };
}

async function setPollenGiftPaymentLoss(
    db: D1Database,
    giftId: string,
    input: {
        idempotencyKey: string;
        stripeEventCreated: number;
        reason: PaymentLossReason;
        active: boolean;
        terminal: boolean;
    },
): Promise<void> {
    // Stripe delivery is at-least-once and event timestamps have one-second
    // precision. A terminal recovery may supersede a terminal loss, but a
    // replayed loss must never supersede a terminal recovery.
    await db
        .prepare(
            `INSERT INTO pollen_gift_payment_loss (
                idempotency_key, gift_id, reason, active, terminal,
                stripe_event_created
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(idempotency_key) DO UPDATE SET
                active = excluded.active,
                terminal = excluded.terminal,
                stripe_event_created = excluded.stripe_event_created
             WHERE excluded.stripe_event_created >= pollen_gift_payment_loss.stripe_event_created
               AND (
                   pollen_gift_payment_loss.terminal = 0
                   OR (
                       pollen_gift_payment_loss.active = 1
                       AND excluded.active = 0
                   )
               )`,
        )
        .bind(
            input.idempotencyKey,
            giftId,
            input.reason,
            input.active ? 1 : 0,
            input.terminal ? 1 : 0,
            input.stripeEventCreated,
        )
        .run();
}

async function reconcilePollenGiftPaymentLoss(
    db: D1Database,
    giftId: string,
): Promise<void> {
    await freezePollenGiftForPaymentLoss(db, giftId);
    await restorePollenGiftAfterPaymentRecovery(db, giftId);
}

async function freezePollenGiftForPaymentLoss(
    db: D1Database,
    giftId: string,
): Promise<void> {
    const activeLoss = `EXISTS (
        SELECT 1 FROM pollen_gift_payment_loss
        WHERE gift_id = pollen_gift_code.id AND active = 1
          AND reason IN ('refund', 'dispute')
    )`;
    const targetStatus = `CASE WHEN EXISTS (
        SELECT 1 FROM pollen_gift_payment_loss
        WHERE gift_id = pollen_gift_code.id AND active = 1
          AND reason = 'refund'
    ) THEN 'refunded' ELSE 'disputed' END`;

    // Every status transition checks the loss ledger in the same statement.
    // The changes() chain debits a redeemed balance only for the winning update.
    await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = ${targetStatus}
                 WHERE id = ? AND status IN ('refunded', 'disputed')
                   AND ${activeLoss}`,
            )
            .bind(giftId),
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status_before_dispute = status,
                     status = ${targetStatus}
                 WHERE id = ? AND status IN ('pending', 'active', 'voided')
                   AND ${activeLoss}`,
            )
            .bind(giftId),
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = ${targetStatus}, status_before_dispute = 'redeemed',
                     balance_reversed = 1
                 WHERE id = ? AND status = 'redeemed' AND balance_reversed = 0
                   AND redeemer_user_id IS NOT NULL AND ${activeLoss}`,
            )
            .bind(giftId),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) - (
                         SELECT pollen_amount FROM pollen_gift_code WHERE id = ?
                     ),
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = (
                     SELECT redeemer_user_id FROM pollen_gift_code WHERE id = ?
                 ) AND changes() = 1`,
            )
            .bind(giftId, giftId),
    ]);
}

async function restorePollenGiftAfterPaymentRecovery(
    db: D1Database,
    giftId: string,
): Promise<void> {
    const noActiveLoss = `NOT EXISTS (
        SELECT 1 FROM pollen_gift_payment_loss
        WHERE gift_id = pollen_gift_code.id AND active = 1
          AND reason IN ('refund', 'dispute')
    )`;

    await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = 'redeemed', status_before_dispute = NULL,
                     balance_reversed = 0
                 WHERE id = ? AND status IN ('refunded', 'disputed')
                   AND status_before_dispute = 'redeemed'
                   AND balance_reversed = 1 AND redeemer_user_id IS NOT NULL
                   AND ${noActiveLoss}`,
            )
            .bind(giftId),
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(
                     COALESCE(pack_balance, 0) + (
                         SELECT pollen_amount FROM pollen_gift_code WHERE id = ?
                     ),
                     ${POLLEN_BILLING_PRECISION}
                 )
                 WHERE id = (
                     SELECT redeemer_user_id FROM pollen_gift_code WHERE id = ?
                 ) AND changes() = 1`,
            )
            .bind(giftId, giftId),
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = CASE
                         WHEN status_before_dispute IN ('pending', 'voided') THEN 'active'
                         ELSE status_before_dispute
                     END,
                     status_before_dispute = NULL,
                     balance_reversed = 0
                 WHERE id = ? AND status IN ('refunded', 'disputed')
                   AND status_before_dispute IN ('pending', 'active', 'voided')
                   AND balance_reversed = 0 AND ${noActiveLoss}`,
            )
            .bind(giftId),
    ]);
}

async function resolvePollenGiftForPaymentEvent(
    db: D1Database,
    paymentIntentId: string,
    giftIdHint?: string,
): Promise<PollenGiftRow | null> {
    const linked = await loadPollenGiftByPaymentIntent(db, paymentIntentId);
    if (linked || !giftIdHint) return linked;

    const hinted = await loadPollenGiftById(db, giftIdHint);
    if (!hinted) return null;
    if (
        hinted.stripePaymentIntentId &&
        hinted.stripePaymentIntentId !== paymentIntentId
    ) {
        return null;
    }
    await db
        .prepare(
            `UPDATE pollen_gift_code
             SET stripe_payment_intent_id = ?
             WHERE id = ? AND stripe_payment_intent_id IS NULL`,
        )
        .bind(paymentIntentId, giftIdHint)
        .run();
    return await loadPollenGiftById(db, giftIdHint);
}

export async function canRevealPollenGiftCode(
    db: D1Database,
    input: { giftId: string; checkoutSessionId: string },
): Promise<{ pollenAmount: number } | null> {
    return await db
        .prepare(
            `SELECT pollen_amount AS pollenAmount
             FROM pollen_gift_code
             WHERE id = ? AND stripe_checkout_session_id = ?
               AND status IN ('pending', 'active', 'redeemed')`,
        )
        .bind(input.giftId, input.checkoutSessionId)
        .first<{ pollenAmount: number }>();
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
    status,
    status_before_dispute AS statusBeforePaymentLoss,
    balance_reversed AS balanceReversed,
    stripe_checkout_session_id AS stripeCheckoutSessionId,
    stripe_payment_intent_id AS stripePaymentIntentId,
    redeemer_user_id AS redeemerUserId
FROM pollen_gift_code`;

function readPollenGiftPresentment(session: Stripe.Checkout.Session): {
    presentmentCurrency: string;
    presentmentAmount: number;
} {
    const details = (
        session as Stripe.Checkout.Session & {
            presentment_details?: {
                presentment_currency?: string | null;
                presentment_amount?: number | null;
            };
        }
    ).presentment_details;
    return {
        presentmentCurrency: details?.presentment_currency ?? "",
        presentmentAmount: details?.presentment_amount ?? 0,
    };
}
