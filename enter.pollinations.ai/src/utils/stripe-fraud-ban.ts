import type Stripe from "stripe";
import {
    collectStripeFraudScores,
    FRAUD_BAN_EXCLUDED_USER_ID,
    FRAUD_BAN_THRESHOLD,
    FraudCheckError,
    type FraudUser,
} from "./stripe-fraud-score.ts";

type FraudQuery = { sql: string; params: string[] };
type QueryRunner = (
    body: FraudQuery | { batch: FraudQuery[] },
) => Promise<{ results?: unknown[] }[]>;

/** All-history hourly check. Callers must explicitly enable writes. */
export async function runFraudBanCheck(
    stripe: Stripe,
    query: QueryRunner,
    {
        apply = false,
        excludedUserIds = [],
    }: { apply?: boolean; excludedUserIds?: string[] } = {},
) {
    const account = await stripe.accounts.retrieve();
    if (account.id !== "acct_1SrY3q7rcjS3l7tr")
        throw new FraudCheckError("Unexpected Stripe account");
    const users: FraudUser[] = [];
    let cursor = "";
    for (;;) {
        const [page] = await query({
            sql: "SELECT id, stripe_customer_id FROM user WHERE id > ? ORDER BY id LIMIT 5000",
            params: [cursor],
        });
        if (!Array.isArray(page?.results))
            throw new FraudCheckError("Invalid D1 user page");
        const rows = page.results as FraudUser[];
        if (
            rows.some(
                (user) =>
                    typeof user.id !== "string" ||
                    (user.stripe_customer_id !== null &&
                        typeof user.stripe_customer_id !== "string"),
            )
        )
            throw new FraudCheckError("Invalid D1 user identity");
        users.push(...rows);
        if (rows.length < 5000) break;
        const next = rows.at(-1)?.id;
        if (!next || next <= cursor)
            throw new FraudCheckError("Invalid D1 pagination");
        cursor = next;
    }
    if (!users.length)
        throw new FraudCheckError("No D1 users; refusing to continue");
    const result = await collectStripeFraudScores(stripe, users);
    const excluded = new Set([FRAUD_BAN_EXCLUDED_USER_ID, ...excludedUserIds]);
    const candidates = users.filter(
        (user) =>
            !excluded.has(user.id) &&
            (result.scores.get(user.id) ?? 0) >= FRAUD_BAN_THRESHOLD,
    );
    // Public Actions logs contain aggregate counts only.
    console.log(
        JSON.stringify({
            apply,
            charges: result.charges,
            unmapped: result.unmapped,
            conflicting: result.conflicting,
            candidates: candidates.length,
        }),
    );
    if (apply) {
        for (const user of candidates) {
            await query({ batch: fraudBanQueries(user.id) });
            // Retry expiry even when the ban already exists.
            for (const customer of result.customers.get(user.id) ?? []) {
                await expireOpenStripeCheckoutSessions(stripe, customer, () => {
                    console.error(
                        "Checkout expiry failed; the next hourly run will retry.",
                    );
                });
            }
        }
    }
    return {
        candidates: candidates.length,
        applied: apply ? candidates.length : 0,
    };
}

export function fraudBanQueries(userId: string) {
    if (userId === FRAUD_BAN_EXCLUDED_USER_ID) return [];
    return [
        "UPDATE user SET banned = 1, ban_reason = 'Payment abuse', ban_expires = NULL, auto_top_up_enabled = 0 WHERE id = ? AND (COALESCE(banned, 0) = 0 OR ban_expires <= unixepoch())",
        "UPDATE user SET auto_top_up_enabled = 0 WHERE id = ?",
        "DELETE FROM session WHERE user_id = ?",
    ].map((sql) => ({ sql, params: [userId] }));
}

/**
 * Expires every open Checkout session of a customer across all list pages.
 * Failures are logged rather than thrown because the restriction is already
 * stored and future checkout attempts remain blocked.
 */
export async function expireOpenStripeCheckoutSessions(
    stripe: Stripe,
    customerId: string,
    logError: (...args: unknown[]) => void = console.error,
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
        logError(
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
        logError(
            `Failed to expire Stripe Checkout session ${sessions[index]?.id} for customer ${customerId}:`,
            result.reason,
        );
    });
}
