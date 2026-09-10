import type Stripe from "stripe";

/** Only use with application-authored messages, never provider/file contents. */
export class FraudCheckError extends Error {}

export const FRAUD_BAN_THRESHOLD = 0.75;
// Manually settled account: never automatically ban it.
export const FRAUD_BAN_EXCLUDED_USER_ID = "GcN1eNVQXW58eLIppqxlgvI6a1w9Scic";
const WEIGHTS = { fd: 5, ew: 2, fraud: 3, hr: 1, rb: 0 } as const;
type Signal = keyof typeof WEIGHTS;
const SIGNALS = Object.keys(WEIGHTS) as Signal[];
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
        created: { lte: until },
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
                rb: charge.outcome?.type === "blocked",
            },
        });
    }
    function paymentFor(value: string | Stripe.Charge) {
        const payment = payments.get(
            typeof value === "string" ? value : value.id,
        );
        if (!payment)
            throw new FraudCheckError("Incomplete Stripe charge coverage");
        return payment.payment;
    }
    for await (const dispute of stripe.disputes.list({
        limit: 100,
        created: { lte: until },
    })) {
        if (!dispute.livemode)
            throw new FraudCheckError("Expected live Stripe disputes");
        if (dispute.reason === "fraudulent")
            paymentFor(dispute.charge).fd = true;
    }
    for await (const warning of stripe.radar.earlyFraudWarnings.list({
        limit: 100,
        created: { lte: until },
    })) {
        if (!warning.livemode)
            throw new FraudCheckError("Expected live Stripe warnings");
        paymentFor(warning.charge).ew = true;
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
        customers,
        charges: payments.size,
        unmapped,
        conflicting,
    };
}
