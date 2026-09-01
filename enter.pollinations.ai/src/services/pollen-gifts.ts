import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import {
    generatePollenGiftCode,
    hashPollenGiftCode,
    POLLEN_GIFT_PURPOSE,
} from "@shared/pollen-gifts.ts";
import { calculateServiceFeeCents } from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { getStripeId } from "../utils/stripe.ts";

type PollenGiftStatus = "pending" | "active" | "redeemed" | "voided";
export type PollenGiftPaymentLossKind = "refund" | "dispute";

type PollenGiftRow = {
    id: string;
    pollenAmount: number;
    status: PollenGiftStatus;
    stripeCheckoutSessionId: string | null;
};

type PollenGiftFulfillmentResult = {
    success: boolean;
    message: string;
    duplicate?: boolean;
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

    const id = crypto.randomUUID();
    const code = generatePollenGiftCode();
    const codeHash = await hashPollenGiftCode(code);
    if (!codeHash) throw new Error("Generated an invalid Pollen gift code");

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
): Promise<void> {
    if (!isPollenGiftCheckoutSession(session)) return;
    const giftId = session.metadata?.giftId;
    if (!giftId) return;

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
    if (!paymentIntentId) {
        return { success: false, message: "Missing payment intent" };
    }
    const activated = await db
        .prepare(
            `UPDATE pollen_gift_code
             SET status = CASE
                     WHEN EXISTS (
                         SELECT 1 FROM pollen_gift_payment_loss
                         WHERE payment_intent_id = ? AND active = 1
                     ) THEN 'voided'
                     ELSE 'active'
                 END,
                 stripe_payment_intent_id = ?
             WHERE id = ?
               AND stripe_checkout_session_id = ?
               AND status = 'pending'
             RETURNING pollen_amount AS pollenAmount, status`,
        )
        .bind(paymentIntentId, paymentIntentId, giftId, session.id)
        .first<{ pollenAmount: number; status: PollenGiftStatus }>();

    if (activated) {
        return {
            success: true,
            message:
                activated.status === "active"
                    ? `Activated ${activated.pollenAmount} Pollen gift`
                    : "Gift payment was already reversed",
            duplicate: false,
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

export async function voidRefundedPollenGift(
    db: D1Database,
    refund: Stripe.Refund,
): Promise<void> {
    if (refund.status !== "succeeded") return;
    const paymentIntentId = getStripeId(refund.payment_intent);
    if (!paymentIntentId) return;

    await setPollenGiftPaymentLoss(db, {
        paymentIntentId,
        kind: "refund",
        active: true,
    });
}

export async function setPollenGiftPaymentLoss(
    db: D1Database,
    input: {
        paymentIntentId: string;
        kind: PollenGiftPaymentLossKind;
        active: boolean;
    },
): Promise<void> {
    const lossKey = `${input.paymentIntentId}:${input.kind}`;
    const upsertLoss = db
        .prepare(
            `INSERT INTO pollen_gift_payment_loss (
                key, payment_intent_id, kind, active
             ) VALUES (?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET active = excluded.active`,
        )
        .bind(lossKey, input.paymentIntentId, input.kind, input.active ? 1 : 0);

    if (input.active) {
        await db.batch([
            upsertLoss,
            db
                .prepare(
                    `UPDATE user
                     SET pack_balance = ROUND(COALESCE(pack_balance, 0) - (
                         SELECT pollen_amount FROM pollen_gift_code
                         WHERE stripe_payment_intent_id = ? AND status = 'redeemed'
                     ), ${POLLEN_BILLING_PRECISION})
                     WHERE id = (
                         SELECT redeemer_user_id FROM pollen_gift_code
                         WHERE stripe_payment_intent_id = ? AND status = 'redeemed'
                     )`,
                )
                .bind(input.paymentIntentId, input.paymentIntentId),
            db
                .prepare(
                    `UPDATE pollen_gift_code SET status = 'voided'
                     WHERE stripe_payment_intent_id = ?
                       AND status IN ('active', 'redeemed')`,
                )
                .bind(input.paymentIntentId),
        ]);
        return;
    }

    await db.batch([
        upsertLoss,
        db
            .prepare(
                `UPDATE user
                 SET pack_balance = ROUND(COALESCE(pack_balance, 0) + (
                     SELECT pollen_amount FROM pollen_gift_code
                     WHERE stripe_payment_intent_id = ?
                       AND status = 'voided'
                       AND redeemer_user_id IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM pollen_gift_payment_loss
                           WHERE payment_intent_id = ? AND active = 1
                       )
                 ), ${POLLEN_BILLING_PRECISION})
                 WHERE id = (
                     SELECT redeemer_user_id FROM pollen_gift_code
                     WHERE stripe_payment_intent_id = ?
                       AND status = 'voided'
                       AND NOT EXISTS (
                           SELECT 1 FROM pollen_gift_payment_loss
                           WHERE payment_intent_id = ? AND active = 1
                       )
                 )`,
            )
            .bind(
                input.paymentIntentId,
                input.paymentIntentId,
                input.paymentIntentId,
                input.paymentIntentId,
            ),
        db
            .prepare(
                `UPDATE pollen_gift_code
                 SET status = CASE
                     WHEN redeemer_user_id IS NULL THEN 'active'
                     ELSE 'redeemed'
                 END
                 WHERE stripe_payment_intent_id = ?
                   AND status = 'voided'
                   AND NOT EXISTS (
                       SELECT 1 FROM pollen_gift_payment_loss
                       WHERE payment_intent_id = ? AND active = 1
                   )`,
            )
            .bind(input.paymentIntentId, input.paymentIntentId),
    ]);
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

const POLLEN_GIFT_SELECT = `SELECT
    id,
    pollen_amount AS pollenAmount,
    status,
    stripe_checkout_session_id AS stripeCheckoutSessionId
FROM pollen_gift_code`;
