export const STRIPE_NEW_CARD_LIMIT = 4;
export const STRIPE_NEW_CARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STRIPE_NEW_CARD_GATE_METADATA = {
    gate: "app_new_card_gate",
    count24h: "app_new_card_count_24h",
    limit24h: "app_new_card_limit_24h",
} as const;

export type StripeNewCardGateStatus = {
    gate: "ok" | "locked";
    distinctFailedCardCount24h: number;
    limit: number;
};

export type StripeCardFingerprintAttemptInput = {
    eventId: string;
    userId: string;
    cardFingerprint: string;
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
            distinctFailedCardCount24h: 0,
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

    const distinctFailedCardCount24h = Number(row?.count ?? 0);

    return {
        gate:
            distinctFailedCardCount24h >= STRIPE_NEW_CARD_LIMIT
                ? "locked"
                : "ok",
        distinctFailedCardCount24h,
        limit: STRIPE_NEW_CARD_LIMIT,
    };
}

export function stripeNewCardGateMetadata(
    status: StripeNewCardGateStatus,
): Record<string, string> {
    return {
        [STRIPE_NEW_CARD_GATE_METADATA.gate]: status.gate,
        [STRIPE_NEW_CARD_GATE_METADATA.count24h]: String(
            status.distinctFailedCardCount24h,
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
                card_fingerprint,
                created_at
            ) VALUES (?, ?, ?, ?)`,
        )
        .bind(
            input.eventId,
            input.userId,
            input.cardFingerprint,
            input.createdAt ?? Date.now(),
        )
        .run();

    return (result.meta.changes ?? 0) > 0;
}
