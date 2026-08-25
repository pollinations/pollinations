import { processAutoTopUpForUser } from "../utils/stripe-billing/auto-top-up.ts";
import {
    BILLING_AUTHORIZATION_TTL_MS,
    cancelBillingAuthorization,
} from "./billing-service.ts";

const BILLING_MAINTENANCE_BATCH_LIMIT = 50;

type AutoTopUpRow = {
    authorizationId: string;
    id: string;
    userId: string;
    autoTopUpAttempts: number;
};

export type BillingMaintenanceResult = {
    expiredAuthorizations: number;
    autoTopUpsProcessed: number;
    prunedAuthorizations: number;
};

async function cancelExpiredAuthorizations(
    db: D1Database,
    now: number,
): Promise<number> {
    const { results } = await db
        .prepare(
            `SELECT id FROM billing_authorization
             WHERE settled_at IS NULL
               AND cancelled_at IS NULL
               AND expires_at <= ?
             ORDER BY expires_at, id
             LIMIT ?`,
        )
        .bind(now, BILLING_MAINTENANCE_BATCH_LIMIT)
        .all<{ id: string }>();
    let cancelled = 0;
    for (const row of results) {
        if (await cancelBillingAuthorization(db, row.id, now)) cancelled += 1;
    }
    return cancelled;
}

function retryDelayMs(attempt: number): number {
    return Math.min(6 * 60 * 60 * 1000, 1000 * 2 ** Math.min(attempt - 1, 15));
}

async function processAutoTopUps(
    env: CloudflareBindings,
    now: number,
): Promise<number> {
    const { results: rows } = await env.DB.prepare(
        `SELECT authorization_id AS authorizationId,
                id,
                user_id AS userId,
                auto_top_up_attempts AS autoTopUpAttempts
         FROM billable_event
         WHERE settled_at IS NOT NULL
           AND auto_top_up_required = 1
           AND auto_top_up_processed_at IS NULL
           AND auto_top_up_next_attempt_at <= ?
         ORDER BY created_at, authorization_id, id
         LIMIT ?`,
    )
        .bind(now, BILLING_MAINTENANCE_BATCH_LIMIT)
        .all<AutoTopUpRow>();
    let processed = 0;
    for (const row of rows) {
        const attempt = row.autoTopUpAttempts + 1;
        const claim = await env.DB.prepare(
            `UPDATE billable_event
             SET auto_top_up_attempts = ?, auto_top_up_next_attempt_at = ?
             WHERE authorization_id = ?
               AND id = ?
               AND auto_top_up_processed_at IS NULL
               AND auto_top_up_next_attempt_at <= ?`,
        )
            .bind(
                attempt,
                now + retryDelayMs(attempt),
                row.authorizationId,
                row.id,
                now,
            )
            .run();
        if (claim.meta.changes !== 1) continue;
        try {
            const result = await processAutoTopUpForUser(env, row.userId);
            if (result.status === "failed") throw new Error(result.reason);
            await env.DB.prepare(
                `UPDATE billable_event
                 SET auto_top_up_processed_at = ?, auto_top_up_error = NULL
                 WHERE authorization_id = ?
                   AND id = ?
                   AND auto_top_up_processed_at IS NULL`,
            )
                .bind(now, row.authorizationId, row.id)
                .run();
            processed += 1;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message.slice(0, 500)
                    : String(error);
            await env.DB.prepare(
                `UPDATE billable_event
                 SET auto_top_up_next_attempt_at = ?, auto_top_up_error = ?
                 WHERE authorization_id = ?
                   AND id = ?
                   AND auto_top_up_processed_at IS NULL`,
            )
                .bind(
                    now + retryDelayMs(attempt),
                    message,
                    row.authorizationId,
                    row.id,
                )
                .run();
        }
    }
    return processed;
}

async function pruneClosedAuthorizations(
    db: D1Database,
    now: number,
): Promise<number> {
    const cutoff = now - BILLING_AUTHORIZATION_TTL_MS;
    const { results } = await db
        .prepare(
            `SELECT authorization.id
             FROM billing_authorization AS authorization
             WHERE authorization.expires_at <= ?
               AND (
                   authorization.settled_at IS NOT NULL
                   OR authorization.cancelled_at IS NOT NULL
               )
               AND NOT EXISTS (
                   SELECT 1 FROM billable_event AS event
                   WHERE event.authorization_id = authorization.id
                     AND event.auto_top_up_required = 1
                     AND event.auto_top_up_processed_at IS NULL
               )
             ORDER BY authorization.expires_at, authorization.id
             LIMIT ?`,
        )
        .bind(cutoff, BILLING_MAINTENANCE_BATCH_LIMIT)
        .all<{ id: string }>();
    if (results.length === 0) return 0;

    const placeholders = results.map(() => "?").join(", ");
    const ids = results.map(({ id }) => id);
    const batch = await db.batch([
        db
            .prepare(
                `DELETE FROM billable_event
                 WHERE authorization_id IN (${placeholders})`,
            )
            .bind(...ids),
        db
            .prepare(
                `DELETE FROM billing_authorization
                 WHERE id IN (${placeholders})
                   AND (settled_at IS NOT NULL OR cancelled_at IS NOT NULL)
                   AND NOT EXISTS (
                       SELECT 1 FROM billable_event
                       WHERE authorization_id = billing_authorization.id
                         AND auto_top_up_required = 1
                         AND auto_top_up_processed_at IS NULL
                   )`,
            )
            .bind(...ids),
    ]);
    return batch[1].meta.changes ?? 0;
}

export async function runBillingMaintenance(
    env: CloudflareBindings,
    now = Date.now(),
): Promise<BillingMaintenanceResult> {
    const expiredAuthorizations = await cancelExpiredAuthorizations(
        env.DB,
        now,
    );
    const autoTopUpsProcessed = await processAutoTopUps(env, now);
    const prunedAuthorizations = await pruneClosedAuthorizations(env.DB, now);
    return {
        expiredAuthorizations,
        autoTopUpsProcessed,
        prunedAuthorizations,
    };
}
