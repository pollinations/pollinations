import {
    STRIPE_NEW_CARD_LIMIT,
    STRIPE_NEW_CARD_WINDOW_MS,
    type StripeNewCardGateStatus,
} from "./stripe-card-gate.ts";

export const POLLEN_GIFT_BUYER_KEY_METADATA = "app_gift_buyer_key";

export async function getStripeGiftCardGateStatus(
    db: D1Database,
    buyerKey: string,
    now = Date.now(),
): Promise<StripeNewCardGateStatus> {
    const [, countResult] = await db.batch([
        db
            .prepare(
                `DELETE FROM stripe_gift_card_fingerprint_attempt
                 WHERE created_at < ?`,
            )
            .bind(now - STRIPE_NEW_CARD_WINDOW_MS),
        db
            .prepare(
                `SELECT COUNT(DISTINCT card_fingerprint) AS count
             FROM stripe_gift_card_fingerprint_attempt
             WHERE buyer_key = ? AND created_at >= ?`,
            )
            .bind(buyerKey, now - STRIPE_NEW_CARD_WINDOW_MS),
    ]);
    const row = countResult.results[0] as { count: number | null } | undefined;
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

export async function recordStripeGiftCardFingerprintAttempt(
    db: D1Database,
    input: {
        eventId: string;
        buyerKey: string;
        cardFingerprint: string;
        createdAt?: number;
    },
): Promise<boolean> {
    if (!input.eventId || !input.buyerKey || !input.cardFingerprint) {
        return false;
    }

    const result = await db
        .prepare(
            `INSERT OR IGNORE INTO stripe_gift_card_fingerprint_attempt (
                event_id, buyer_key, card_fingerprint, created_at
             ) VALUES (?, ?, ?, ?)`,
        )
        .bind(
            input.eventId,
            input.buyerKey,
            input.cardFingerprint,
            input.createdAt ?? Date.now(),
        )
        .run();

    return (result.meta.changes ?? 0) === 1;
}

export async function consumePollenGiftRateLimit(
    db: D1Database,
    input: {
        key: string;
        limit: number;
        windowMs: number;
        now?: number;
    },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = input.now ?? Date.now();
    const cutoff = now - input.windowMs;
    const [, rateLimitResult] = await db.batch([
        db
            .prepare(
                `DELETE FROM pollen_gift_rate_limit
                 WHERE window_started_at < ?`,
            )
            .bind(now - STRIPE_NEW_CARD_WINDOW_MS),
        db
            .prepare(
                `INSERT INTO pollen_gift_rate_limit (
                key, window_started_at, attempts
             ) VALUES (?, ?, 1)
             ON CONFLICT(key) DO UPDATE SET
                attempts = CASE
                    WHEN window_started_at <= ? THEN 1
                    ELSE attempts + 1
                END,
                window_started_at = CASE
                    WHEN window_started_at <= ? THEN excluded.window_started_at
                    ELSE window_started_at
                END
             RETURNING attempts, window_started_at AS windowStartedAt`,
            )
            .bind(input.key, now, cutoff, cutoff),
    ]);
    const row = rateLimitResult.results[0] as
        | { attempts: number; windowStartedAt: number }
        | undefined;

    if (!row) throw new Error("Gift rate limit update failed");
    const retryAfterMs = Math.max(
        0,
        row.windowStartedAt + input.windowMs - now,
    );
    return {
        allowed: row.attempts <= input.limit,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
}
