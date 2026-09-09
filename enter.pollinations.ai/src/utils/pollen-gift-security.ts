export const MAX_POLLEN_GIFT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

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
            .bind(now - MAX_POLLEN_GIFT_RATE_LIMIT_WINDOW_MS),
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
