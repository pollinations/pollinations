import type Stripe from "stripe";

export const STRIPE_PAYMENT_RESTRICTED_CODE = "PAYMENTS_RESTRICTED";
export const STRIPE_PAYMENT_SUPPORT_EMAIL = "billing@pollinations.ai";

export type StripePaymentRestriction = {
    reason: string;
    source: "automatic" | "manual";
    restrictedAt: string;
};

export async function getStripePaymentRestriction(
    db: D1Database,
    userId: string,
): Promise<string | null> {
    const row = await db
        .prepare(
            `SELECT stripe_payment_restriction AS restriction
            FROM user
            WHERE id = ?`,
        )
        .bind(userId)
        .first<{ restriction: string | null }>();

    return row?.restriction ?? null;
}

export async function restrictStripePayments(
    db: D1Database,
    userId: string,
    input: Omit<StripePaymentRestriction, "restrictedAt"> & {
        restrictedAt?: string;
    },
): Promise<boolean> {
    const restriction: StripePaymentRestriction = {
        reason: input.reason,
        source: input.source,
        restrictedAt: input.restrictedAt ?? new Date().toISOString(),
    };
    const result = await db
        .prepare(
            `UPDATE user
            SET stripe_payment_restriction = ?,
                auto_top_up_enabled = 0
            WHERE id = ?
                AND stripe_payment_restriction IS NULL`,
        )
        .bind(JSON.stringify(restriction), userId)
        .run();

    return (result.meta.changes ?? 0) === 1;
}

export async function clearStripePaymentRestriction(
    db: D1Database,
    userId: string,
): Promise<boolean> {
    const result = await db
        .prepare(
            `UPDATE user
            SET stripe_payment_restriction = NULL
            WHERE id = ?
                AND stripe_payment_restriction IS NOT NULL`,
        )
        .bind(userId)
        .run();

    return (result.meta.changes ?? 0) === 1;
}

export function stripePaymentRestrictedResponse() {
    return {
        code: STRIPE_PAYMENT_RESTRICTED_CODE,
        error: "Payments are unavailable for this account.",
        supportEmail: STRIPE_PAYMENT_SUPPORT_EMAIL,
    };
}

export async function expireOpenStripeCheckoutSessions(
    stripe: Stripe,
    filter: { customer?: string; paymentIntent?: string },
): Promise<number> {
    const sessions = await stripe.checkout.sessions.list({
        ...(filter.customer ? { customer: filter.customer } : {}),
        ...(filter.paymentIntent
            ? { payment_intent: filter.paymentIntent }
            : {}),
        status: "open",
        limit: 100,
    });

    await Promise.all(
        sessions.data.map((session) =>
            stripe.checkout.sessions.expire(session.id),
        ),
    );
    return sessions.data.length;
}
