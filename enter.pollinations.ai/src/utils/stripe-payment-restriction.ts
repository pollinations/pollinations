import type Stripe from "stripe";

export const STRIPE_PAYMENT_RESTRICTED_CODE = "PAYMENTS_RESTRICTED";
export const STRIPE_PAYMENT_RESTRICTED_MESSAGE =
    "Payments are unavailable for this account.";
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
        error: STRIPE_PAYMENT_RESTRICTED_MESSAGE,
        supportEmail: STRIPE_PAYMENT_SUPPORT_EMAIL,
    };
}

/**
 * Expires every open Checkout session of a customer. Individual expiry
 * failures are logged and counted rather than thrown, so callers that have
 * already stored a restriction can report what actually happened.
 */
export async function expireOpenStripeCheckoutSessions(
    stripe: Stripe,
    customerId: string,
): Promise<{ expired: number; failed: number }> {
    const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 100,
    });

    const results = await Promise.allSettled(
        sessions.data.map((session) =>
            stripe.checkout.sessions.expire(session.id),
        ),
    );
    let failed = 0;
    results.forEach((result, index) => {
        if (result.status !== "rejected") return;
        failed += 1;
        console.error(
            `Failed to expire Stripe Checkout session ${sessions.data[index]?.id} for customer ${customerId}:`,
            result.reason,
        );
    });
    return { expired: results.length - failed, failed };
}
