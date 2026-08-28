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
    statusBeforePaymentLoss: PollenGiftStatus | null;
    balanceReversed: number;
    stripeCheckoutSessionId: string | null;
    stripePaymentIntentId: string | null;
    redeemerUserId: string | null;
    activatedAt: number | null;
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
    const paymentIntentId = stripeObjectId(session.payment_intent);
    const invoiceId = stripeObjectId(session.invoice);
    const presentment = readPollenGiftPresentment(session);
    const result = await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = CASE
                     WHEN status IN ('pending', 'voided') THEN 'active'
                     ELSE status
                 END,
                 invalidated_at = CASE
                     WHEN status IN ('pending', 'voided') THEN NULL
                     ELSE invalidated_at
                 END,
                 paid_amount_cents = ?,
                 paid_currency = ?,
                 stripe_payment_intent_id = ?,
                 stripe_invoice_id = ?,
                 activated_at = ?
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status IN (
                   'pending', 'voided', 'active', 'redeemed', 'refunded', 'disputed'
               )`,
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
        return { success: false, message: "Could not activate gift order" };
    }

    const latest = await loadPollenGiftById(db, giftId);
    if (!latest) return { success: false, message: "Gift order not found" };
    return {
        success: true,
        message:
            latest.status === "active"
                ? `Activated ${latest.pollenAmount} Pollen gift`
                : `Gift order already ${latest.status}`,
        duplicate: latest.status !== "active" || gift.status === "active",
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
    const [, , creditResult] = await db.batch([
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
                `INSERT INTO pollen_gift_adjustment (
                    idempotency_key, gift_id, stripe_event_id, user_id,
                    pollen_delta, amount_cents, reason, active, terminal,
                    stripe_event_created, created_at
                 ) SELECT ?, ?, ?, ?, ?, 0, 'redeem', 0, 1, 0, ?
                 WHERE changes() = 1`,
            )
            .bind(
                `redeem:${gift.id}`,
                gift.id,
                `redeem:${gift.id}`,
                userId,
                gift.pollenAmount,
                redeemedAt,
            ),
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
    const paymentIntentId = stripeObjectId(refund.payment_intent);
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
        stripeEventId: event.id,
        stripeEventCreated: event.created,
        amountCents: refund.amount,
        reason: "refund",
        active: refund.status === "succeeded",
        terminal: refund.status === "failed",
    });
    await updatePollenGiftRefundTotal(db, gift.id);
    await reconcilePollenGiftPaymentLoss(db, gift.id, event);
    return true;
}

export async function handlePollenGiftDispute(
    db: D1Database,
    event: Stripe.Event,
    dispute: Stripe.Dispute,
    giftIdHint?: string,
): Promise<boolean> {
    const paymentIntentId = stripeObjectId(dispute.payment_intent);
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
        stripeEventId: event.id,
        stripeEventCreated: event.created,
        amountCents: dispute.amount,
        reason: "dispute",
        ...loss,
    });
    await reconcilePollenGiftPaymentLoss(db, gift.id, event);
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
        stripeEventId: string;
        stripeEventCreated: number;
        amountCents: number;
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
            `INSERT INTO pollen_gift_adjustment (
                idempotency_key, gift_id, stripe_event_id, user_id,
                pollen_delta, amount_cents, reason, active, terminal,
                stripe_event_created, created_at
             ) VALUES (?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(idempotency_key) DO UPDATE SET
                stripe_event_id = excluded.stripe_event_id,
                amount_cents = excluded.amount_cents,
                active = excluded.active,
                terminal = excluded.terminal,
                stripe_event_created = excluded.stripe_event_created
             WHERE excluded.stripe_event_created >= pollen_gift_adjustment.stripe_event_created
               AND (
                   pollen_gift_adjustment.terminal = 0
                   OR (
                       pollen_gift_adjustment.active = 1
                       AND excluded.active = 0
                   )
               )`,
        )
        .bind(
            input.idempotencyKey,
            giftId,
            input.stripeEventId,
            input.amountCents,
            input.reason,
            input.active ? 1 : 0,
            input.terminal ? 1 : 0,
            input.stripeEventCreated,
            Date.now(),
        )
        .run();
}

async function updatePollenGiftRefundTotal(
    db: D1Database,
    giftId: string,
): Promise<void> {
    await db
        .prepare(
            `UPDATE pollen_gift_code
             SET refunded_amount_cents = COALESCE((
                 SELECT SUM(amount_cents)
                 FROM pollen_gift_adjustment
                 WHERE gift_id = ? AND reason = 'refund' AND active = 1
             ), 0)
             WHERE id = ?`,
        )
        .bind(giftId, giftId)
        .run();
}

async function reconcilePollenGiftPaymentLoss(
    db: D1Database,
    giftId: string,
    event: Stripe.Event,
): Promise<void> {
    const loss = await db
        .prepare(
            `SELECT
                COUNT(*) AS activeLossCount,
                SUM(CASE WHEN reason = 'refund' THEN 1 ELSE 0 END) AS activeRefundCount
             FROM pollen_gift_adjustment
             WHERE gift_id = ? AND active = 1
               AND reason IN ('refund', 'dispute')`,
        )
        .bind(giftId)
        .first<{ activeLossCount: number; activeRefundCount: number }>();
    const gift = await loadPollenGiftById(db, giftId);
    if (!gift)
        throw new Error(`Gift ${giftId} disappeared during reconciliation`);

    if (Number(loss?.activeLossCount ?? 0) > 0) {
        await freezePollenGiftForPaymentLoss(
            db,
            gift,
            Number(loss?.activeRefundCount ?? 0) > 0 ? "refunded" : "disputed",
            event,
        );
        return;
    }
    await restorePollenGiftAfterPaymentRecovery(db, gift, event);
}

async function freezePollenGiftForPaymentLoss(
    db: D1Database,
    gift: PollenGiftRow,
    targetStatus: "refunded" | "disputed",
    event: Stripe.Event,
): Promise<void> {
    if (gift.status === "refunded" || gift.status === "disputed") {
        await db
            .prepare(`UPDATE pollen_gift_code SET status = ? WHERE id = ?`)
            .bind(targetStatus, gift.id)
            .run();
        return;
    }
    if (gift.status !== "redeemed" || !gift.redeemerUserId) {
        await db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = ?, status_before_dispute = status,
                     invalidated_at = ?
                 WHERE id = ? AND status IN ('pending', 'active', 'voided')`,
            )
            .bind(targetStatus, Date.now(), gift.id)
            .run();
        return;
    }
    if (gift.balanceReversed) return;

    // D1 executes a batch transactionally. Each statement after the guarded
    // status change uses changes() so only the winner debits the wallet.
    await db.batch([
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = ?, status_before_dispute = 'redeemed',
                     balance_reversed = 1, invalidated_at = ?
                 WHERE id = ? AND status = 'redeemed' AND balance_reversed = 0`,
            )
            .bind(targetStatus, Date.now(), gift.id),
        db
            .prepare(
                `INSERT INTO pollen_gift_adjustment (
                    idempotency_key, gift_id, stripe_event_id, user_id,
                    pollen_delta, amount_cents, reason, active, terminal,
                    stripe_event_created, created_at
                 ) SELECT ?, ?, ?, ?, ?, 0, 'balance_reversed', 0, 1, ?, ?
                 WHERE changes() = 1`,
            )
            .bind(
                `balance-loss:${event.id}`,
                gift.id,
                event.id,
                gift.redeemerUserId,
                -gift.pollenAmount,
                event.created,
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
}

async function restorePollenGiftAfterPaymentRecovery(
    db: D1Database,
    gift: PollenGiftRow,
    event: Stripe.Event,
): Promise<void> {
    if (gift.status !== "refunded" && gift.status !== "disputed") return;
    const previous = gift.statusBeforePaymentLoss;
    if (!previous) return;
    const restoredStatus =
        (previous === "pending" || previous === "voided") && gift.activatedAt
            ? "active"
            : previous;

    if (
        restoredStatus === "redeemed" &&
        gift.balanceReversed &&
        gift.redeemerUserId
    ) {
        // The same changes() chain makes concurrent/replayed recoveries credit
        // the wallet at most once.
        await db.batch([
            db
                .prepare(
                    `UPDATE pollen_gift_code
                     SET status = 'redeemed', status_before_dispute = NULL,
                         balance_reversed = 0, invalidated_at = NULL
                     WHERE id = ? AND status IN ('refunded', 'disputed')
                       AND balance_reversed = 1`,
                )
                .bind(gift.id),
            db
                .prepare(
                    `INSERT INTO pollen_gift_adjustment (
                        idempotency_key, gift_id, stripe_event_id, user_id,
                        pollen_delta, amount_cents, reason, active, terminal,
                        stripe_event_created, created_at
                     ) SELECT ?, ?, ?, ?, ?, 0, 'balance_restored', 0, 1, ?, ?
                     WHERE changes() = 1`,
                )
                .bind(
                    `balance-recovery:${event.id}`,
                    gift.id,
                    event.id,
                    gift.redeemerUserId,
                    gift.pollenAmount,
                    event.created,
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
        return;
    }

    if (
        restoredStatus !== "pending" &&
        restoredStatus !== "active" &&
        restoredStatus !== "voided"
    ) {
        return;
    }
    await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = ?, status_before_dispute = NULL,
                 balance_reversed = 0, invalidated_at = NULL
             WHERE id = ? AND status IN ('refunded', 'disputed')`,
        )
        .bind(restoredStatus, gift.id)
        .run();
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
    face_value_cents AS faceValueCents,
    service_fee_cents AS serviceFeeCents,
    paid_amount_cents AS paidAmountCents,
    paid_currency AS paidCurrency,
    refunded_amount_cents AS refundedAmountCents,
    status,
    status_before_dispute AS statusBeforePaymentLoss,
    balance_reversed AS balanceReversed,
    stripe_checkout_session_id AS stripeCheckoutSessionId,
    stripe_payment_intent_id AS stripePaymentIntentId,
    redeemer_user_id AS redeemerUserId,
    activated_at AS activatedAt
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

function stripeObjectId(value: { id: string } | string | null): string | null {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

function isUniqueConstraintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("UNIQUE constraint failed");
}
