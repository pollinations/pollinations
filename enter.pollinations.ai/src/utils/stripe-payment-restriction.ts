import type Stripe from "stripe";

export const ACCOUNT_RESTRICTED_MESSAGE = "Account restricted.";

export async function restrictStripePayments(
    db: D1Database,
    userId: string,
    restrictedAt = new Date().toISOString(),
): Promise<void> {
    await db
        .prepare(
            `UPDATE user
            SET stripe_payment_restriction = ?,
                auto_top_up_enabled = 0
            WHERE id = ?
                AND stripe_payment_restriction IS NULL`,
        )
        .bind(restrictedAt, userId)
        .run();
}

/**
 * Expires every open Checkout session of a customer across all list pages.
 * Failures are logged rather than thrown because the restriction is already
 * stored and future checkout attempts remain blocked.
 */
export async function expireOpenStripeCheckoutSessions(
    stripe: Stripe,
    customerId: string,
): Promise<void> {
    const sessions: Stripe.Checkout.Session[] = [];
    try {
        for await (const session of stripe.checkout.sessions.list({
            customer: customerId,
            status: "open",
            limit: 100,
        })) {
            sessions.push(session);
        }
    } catch (error) {
        console.error(
            `Failed to list open Stripe Checkout sessions for customer ${customerId}:`,
            error,
        );
        return;
    }

    const results = await Promise.allSettled(
        sessions.map((session) => stripe.checkout.sessions.expire(session.id)),
    );
    results.forEach((result, index) => {
        if (result.status !== "rejected") return;
        console.error(
            `Failed to expire Stripe Checkout session ${sessions[index]?.id} for customer ${customerId}:`,
            result.reason,
        );
    });
}
