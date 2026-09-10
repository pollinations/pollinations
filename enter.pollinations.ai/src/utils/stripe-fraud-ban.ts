import type Stripe from "stripe";

export async function banFraudAccount(
    db: D1Database,
    userId: string,
): Promise<void> {
    await db.batch([
        db
            .prepare(
                `UPDATE user SET banned = 1, ban_reason = 'Payment abuse', ban_expires = NULL, auto_top_up_enabled = 0 WHERE id = ? AND (COALESCE(banned, 0) = 0 OR ban_expires <= unixepoch())`,
            )
            .bind(userId),
        db
            .prepare("UPDATE user SET auto_top_up_enabled = 0 WHERE id = ?")
            .bind(userId),
        db.prepare("DELETE FROM session WHERE user_id = ?").bind(userId),
    ]);
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
