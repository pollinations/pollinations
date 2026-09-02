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

export type StripeCheckoutSessionCleanup = {
    /** False when Stripe failed to list the sessions; some may remain open. */
    listingComplete: boolean;
    expired: number;
    failed: number;
};

/**
 * Expires every open Checkout session of a customer across all list pages.
 * Listing and expiry failures are logged and reported rather than thrown, so
 * callers that have already stored a restriction can say what happened.
 */
export async function expireOpenStripeCheckoutSessions(
    stripe: Stripe,
    customerId: string,
): Promise<StripeCheckoutSessionCleanup> {
    const sessions: Stripe.Checkout.Session[] = [];
    let listingComplete = true;
    try {
        for await (const session of stripe.checkout.sessions.list({
            customer: customerId,
            status: "open",
            limit: 100,
        })) {
            sessions.push(session);
        }
    } catch (error) {
        listingComplete = false;
        console.error(
            `Failed to list open Stripe Checkout sessions for customer ${customerId}:`,
            error,
        );
    }

    const results = await Promise.allSettled(
        sessions.map((session) => stripe.checkout.sessions.expire(session.id)),
    );
    let failed = 0;
    results.forEach((result, index) => {
        if (result.status !== "rejected") return;
        failed += 1;
        console.error(
            `Failed to expire Stripe Checkout session ${sessions[index]?.id} for customer ${customerId}:`,
            result.reason,
        );
    });
    return { listingComplete, expired: results.length - failed, failed };
}
