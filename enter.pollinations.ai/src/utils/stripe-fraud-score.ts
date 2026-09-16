import type Stripe from "stripe";

/** Only use with application-authored messages, never provider/file contents. */
export class FraudCheckError extends Error {}

export const FRAUD_BAN_THRESHOLD = 0.75;
/**
 * Charges before this date can never be attributed: checkout created a
 * throwaway customer per purchase and wrote the user id only on the Checkout
 * Session, so neither the stored customer nor the payment metadata identifies
 * the buyer. A live scan on 2026-09-16 attributed 0 of the 12,248 charges
 * before May and 100% from June, so scanning them is pure cost.
 */
export const FRAUD_SCAN_START_SECONDS = Math.floor(Date.UTC(2026, 4, 1) / 1000);
// Manually settled account: never automatically ban it.
export const FRAUD_BAN_EXCLUDED_USER_ID = "GcN1eNVQXW58eLIppqxlgvI6a1w9Scic";
// Radar blocks alone carry no weight: a decline is not evidence of fraud.
const WEIGHTS = { fd: 5, ew: 2, fraud: 3, hr: 1, rb: 0 } as const;
type Signal = keyof typeof WEIGHTS;
const SIGNALS = (Object.keys(WEIGHTS) as Signal[]).filter(
    (signal) => WEIGHTS[signal] > 0,
);
/**
 * Reports from a person or issuer after the payment, rather than only Radar's
 * prediction at the moment of the attempt. An issuer warning is still suspected
 * fraud, not proof. Repeated legitimate declines can escalate Radar predictions,
 * so prediction volume alone must never ban an account.
 */
const CONFIRMED_SIGNALS = [
    "fd",
    "ew",
    "fraud",
] as const satisfies readonly Signal[];
export type FraudPayment = { chargeId: string } & Partial<
    Record<Signal, boolean>
>;

/** Simulator parity: deduplicate charges, strongest signal wins, sum capped contributions. */
export function cappedFraudScore(payments: Iterable<FraudPayment>): number {
    const charges = new Map<string, Set<Signal>>();
    for (const payment of payments) {
        if (!/^(ch|py)_.+/.test(payment.chargeId))
            throw new FraudCheckError("Missing Stripe charge identity");
        const flags = charges.get(payment.chargeId) ?? new Set<Signal>();
        for (const signal of SIGNALS) if (payment[signal]) flags.add(signal);
        charges.set(payment.chargeId, flags);
    }
    const counts = { fd: 0, ew: 0, fraud: 0, hr: 0, rb: 0 };
    for (const flags of charges.values()) {
        let winner: Signal | undefined;
        for (const signal of SIGNALS) {
            if (
                flags.has(signal) &&
                WEIGHTS[signal] > (winner ? WEIGHTS[winner] : 0)
            )
                winner = signal;
        }
        if (winner) counts[winner]++;
    }
    const score = SIGNALS.reduce(
        (sum, signal) =>
            sum +
            WEIGHTS[signal] *
                Math.min(
                    1,
                    0.1 *
                        (counts[signal] / 2) ** (Math.log(10) / Math.log(500)),
                ),
        0,
    );
    return Number(score.toFixed(2));
}

export function hasConfirmedFraud(payments: Iterable<FraudPayment>): boolean {
    for (const payment of payments)
        if (CONFIRMED_SIGNALS.some((signal) => payment[signal])) return true;
    return false;
}

export type FraudUser = { id: string; stripe_customer_id: string | null };

/** Fail the whole scan before any writes if a source cannot be fully read. */
export async function collectStripeFraudScores(
    stripe: Stripe,
    users: FraudUser[],
    until = Math.floor(Date.now() / 1000),
) {
    const userIds = new Set(users.map((user) => user.id));
    const customerUsers = new Map<string, Set<string>>();
    for (const user of users) {
        if (!user.stripe_customer_id) continue;
        const ids =
            customerUsers.get(user.stripe_customer_id) ?? new Set<string>();
        ids.add(user.id);
        customerUsers.set(user.stripe_customer_id, ids);
    }
    const payments = new Map<
        string,
        { userId: string | null; payment: FraudPayment }
    >();
    const customers = new Map<string, Set<string>>();
    for (const [customerId, ids] of customerUsers) {
        if (ids.size === 1) {
            const [id] = ids;
            const linked = customers.get(id) ?? new Set<string>();
            linked.add(customerId);
            customers.set(id, linked);
        }
    }
    let unmapped = 0;
    let conflicting = 0;
    for await (const charge of stripe.charges.list({
        limit: 100,
        created: { gte: FRAUD_SCAN_START_SECONDS, lte: until },
    })) {
        if (!charge.livemode)
            throw new FraudCheckError("Expected live Stripe charges");
        const customerId =
            typeof charge.customer === "string"
                ? charge.customer
                : charge.customer?.id;
        const ids = new Set(customerId ? customerUsers.get(customerId) : []);
        // Billing/receipt email is buyer-controlled, not proof of account identity.
        for (const id of [
            charge.metadata?.userId,
            charge.metadata?.pollinations_user_id,
        ])
            if (id) ids.add(id);
        const [candidate] = ids;
        const userId =
            ids.size === 1 && userIds.has(candidate) ? candidate : null;
        if (!userId) unmapped++;
        if (ids.size > 1) conflicting++;
        if (userId && customerId) {
            const linked = customers.get(userId) ?? new Set<string>();
            linked.add(customerId);
            customers.set(userId, linked);
        }
        payments.set(charge.id, {
            userId,
            payment: {
                chargeId: charge.id,
                fraud:
                    charge.fraud_details?.stripe_report === "fraudulent" ||
                    charge.fraud_details?.user_report === "fraudulent",
                hr: charge.outcome?.risk_level === "highest",
            },
        });
    }
    /**
     * Disputes and warnings are listed by their own date, so one can point at a
     * charge older than the scan window. Confirm that is the reason before
     * trusting a map with a hole in it: anything inside the window must be
     * present, or the charge pages did not load completely.
     */
    const archivedChargeIds = new Set<string>();
    async function paymentFor(value: string | Stripe.Charge) {
        const id = typeof value === "string" ? value : value.id;
        const known = payments.get(id);
        if (known) return known.payment;
        if (archivedChargeIds.has(id)) return null;
        const charge =
            typeof value === "string"
                ? await stripe.charges.retrieve(id).catch(() => null)
                : value;
        // Unknown or unreadable means we cannot prove the charge predates the
        // window, so treat it as a hole in the pages rather than skipping it.
        const created =
            typeof charge?.created === "number" ? charge.created : null;
        if (created === null || created >= FRAUD_SCAN_START_SECONDS)
            throw new FraudCheckError("Incomplete Stripe charge coverage");
        archivedChargeIds.add(id);
        return null;
    }
    // A dispute or warning cannot predate its charge. Earlier events cannot
    // affect this window; recent events against older charges are checked above.
    for await (const dispute of stripe.disputes.list({
        limit: 100,
        created: { gte: FRAUD_SCAN_START_SECONDS, lte: until },
    })) {
        if (!dispute.livemode)
            throw new FraudCheckError("Expected live Stripe disputes");
        if (dispute.reason === "fraudulent") {
            const payment = await paymentFor(dispute.charge);
            if (payment) payment.fd = true;
        }
    }
    for await (const warning of stripe.radar.earlyFraudWarnings.list({
        limit: 100,
        created: { gte: FRAUD_SCAN_START_SECONDS, lte: until },
    })) {
        if (!warning.livemode)
            throw new FraudCheckError("Expected live Stripe warnings");
        const payment = await paymentFor(warning.charge);
        if (payment) payment.ew = true;
    }
    // Never expire another account's checkout on an ambiguously shared customer.
    const customerOwners = new Map<string, Set<string>>();
    for (const [id, linked] of customers) {
        for (const customerId of linked) {
            const owners = customerOwners.get(customerId) ?? new Set<string>();
            owners.add(id);
            customerOwners.set(customerId, owners);
        }
    }
    for (const [customerId, owners] of customerOwners) {
        if (owners.size > 1)
            for (const id of owners) customers.get(id)?.delete(customerId);
    }
    const byUser = new Map<string, FraudPayment[]>();
    for (const { userId, payment } of payments.values()) {
        if (!userId) continue;
        const list = byUser.get(userId) ?? [];
        list.push(payment);
        byUser.set(userId, list);
    }
    return {
        scores: new Map(
            [...byUser].map(([id, list]) => [id, cappedFraudScore(list)]),
        ),
        confirmed: new Set(
            [...byUser]
                .filter(([, list]) => hasConfirmedFraud(list))
                .map(([id]) => id),
        ),
        customers,
        charges: payments.size,
        unmapped,
        conflicting,
    };
}
