export const STRIPE_NEW_CARD_LIMIT = 4;
export const STRIPE_NEW_CARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STRIPE_NEW_CARD_GATE_METADATA = {
    gate: "app_new_card_gate",
    count24h: "app_new_card_count_24h",
    limit24h: "app_new_card_limit_24h",
} as const;

export type StripeNewCardGateStatus = {
    gate: "ok" | "locked";
    distinctCardCount24h: number;
    limit: number;
};

export type StripeCardFingerprintAttemptInput = {
    eventId: string;
    userId: string;
    stripeCustomerId?: string;
    customerEmail?: string;
    cardFingerprint: string;
    cardBrand?: string;
    cardCountry?: string;
    paymentIntentId?: string;
    chargeId?: string;
    status: string;
    livemode: boolean;
    createdAt?: number;
};

export async function getStripeNewCardGateStatus(
    db: D1Database,
    userId: string,
    now = Date.now(),
): Promise<StripeNewCardGateStatus> {
    if (!userId) {
        return {
            gate: "ok",
            distinctCardCount24h: 0,
            limit: STRIPE_NEW_CARD_LIMIT,
        };
    }

    const windowStart = now - STRIPE_NEW_CARD_WINDOW_MS;
    const row = await db
        .prepare(
            `SELECT COUNT(DISTINCT card_fingerprint) AS count
            FROM stripe_card_fingerprint_attempt
            WHERE user_id = ?
                AND created_at >= ?`,
        )
        .bind(userId, windowStart)
        .first<{ count: number | null }>();

    const distinctCardCount24h = Number(row?.count ?? 0);

    return {
        gate: distinctCardCount24h >= STRIPE_NEW_CARD_LIMIT ? "locked" : "ok",
        distinctCardCount24h,
        limit: STRIPE_NEW_CARD_LIMIT,
    };
}

export function stripeNewCardGateMetadata(
    status: StripeNewCardGateStatus,
): Record<string, string> {
    return {
        [STRIPE_NEW_CARD_GATE_METADATA.gate]: status.gate,
        [STRIPE_NEW_CARD_GATE_METADATA.count24h]: String(
            status.distinctCardCount24h,
        ),
        [STRIPE_NEW_CARD_GATE_METADATA.limit24h]: String(status.limit),
    };
}

export async function recordStripeCardFingerprintAttempt(
    db: D1Database,
    input: StripeCardFingerprintAttemptInput,
): Promise<boolean> {
    if (!input.eventId || !input.userId || !input.cardFingerprint) {
        return false;
    }

    const result = await db
        .prepare(
            `INSERT OR IGNORE INTO stripe_card_fingerprint_attempt (
                event_id,
                user_id,
                stripe_customer_id,
                customer_email,
                card_fingerprint,
                card_brand,
                card_country,
                payment_intent_id,
                charge_id,
                status,
                livemode,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            input.eventId,
            input.userId,
            input.stripeCustomerId ?? null,
            input.customerEmail ?? null,
            input.cardFingerprint,
            input.cardBrand ?? null,
            input.cardCountry ?? null,
            input.paymentIntentId ?? null,
            input.chargeId ?? null,
            input.status,
            input.livemode ? 1 : 0,
            input.createdAt ?? Date.now(),
        )
        .run();

    return (result.meta.changes ?? 0) > 0;
}
