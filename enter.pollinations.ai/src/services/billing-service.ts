import type { ApiKeyAuthResult } from "@shared/auth/api-key.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { resolveDevMarkup } from "@shared/billing/track-helpers.ts";
import type { BillableEvent } from "@shared/schemas/billable-event.ts";
import { drizzle } from "drizzle-orm/d1";

type PreparedEvent = BillableEvent & {
    billedPrice: number;
    devUserId: string | null;
    devCredit: number;
};

type StoredEvent = {
    id: string;
    requestId: string;
    apiKeyId: string;
    userId: string;
    meter: string;
    price: number;
    billedPrice: number;
    paidOnly: number;
    payerBucket: "tier" | "pack" | null;
    occurredAt: number;
};

export type BillingEventResult =
    | {
          id: string;
          status: "settled" | "duplicate";
          billedPrice: number;
          payerBucket: "tier" | "pack" | null;
      }
    | {
          id: string;
          status: "rejected";
          reason: "api_key_unavailable_or_budget_exhausted";
      }
    | {
          id: string;
          status: "conflict";
          reason: "event_id_already_used";
      };

async function prepareEvents(
    db: D1Database,
    auth: ApiKeyAuthResult,
    events: BillableEvent[],
): Promise<PreparedEvent[]> {
    const balanceDb = drizzle(db);
    return Promise.all(
        events.map(async (event) => {
            const price = event.price === 0 ? 0 : event.price;
            const markup = await resolveDevMarkup(
                balanceDb,
                auth.apiKey.byopClientKeyId,
                price,
                auth.user?.id,
            );
            const devCredit = markup?.devCredit ?? 0;
            return {
                ...event,
                price,
                billedPrice: roundPollenLedgerAmount(price + devCredit),
                devUserId: markup?.devUserId ?? null,
                devCredit,
            };
        }),
    );
}

function insertEvent(
    db: D1Database,
    event: PreparedEvent,
    auth: ApiKeyAuthResult,
): D1PreparedStatement {
    return db
        .prepare(
            `INSERT INTO billable_event (
                id, request_id, api_key_id, user_id, meter, price,
                billed_price, paid_only, payer_bucket, dev_user_id,
                dev_credit, occurred_at
            )
            SELECT
                ?, ?, api_key.id, payer.id, ?, ?, ?, ?,
                CASE
                    WHEN ? <= 0 THEN NULL
                    WHEN ? = 1 THEN 'pack'
                    WHEN COALESCE(payer.tier_balance, 0) >= ? THEN 'tier'
                    WHEN COALESCE(payer.pack_balance, 0) > 0 THEN 'pack'
                    ELSE 'tier'
                END,
                ?, ?, ?
            FROM apikey AS api_key
            JOIN user AS payer ON payer.id = api_key.user_id
            WHERE api_key.id = ?
              AND api_key.user_id = ?
              AND api_key.enabled = 1
              AND (api_key.expires_at IS NULL OR api_key.expires_at > unixepoch())
              AND (
                  api_key.pollen_balance IS NULL
                  OR api_key.pollen_balance >= ?
              )
            ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
            event.id,
            event.requestId,
            event.meter,
            event.price,
            event.billedPrice,
            event.paidOnly ? 1 : 0,
            event.billedPrice,
            event.paidOnly ? 1 : 0,
            event.billedPrice,
            event.devUserId,
            event.devCredit,
            event.occurredAt,
            auth.apiKey.id,
            auth.user?.id,
            event.billedPrice,
        );
}

function deductUser(db: D1Database, eventId: string, apiKeyId: string) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE id = ? AND api_key_id = ? AND settled_at IS NULL
                     ) = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) - (
                         SELECT billed_price FROM billable_event WHERE id = ?
                     ), 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE id = ? AND api_key_id = ? AND settled_at IS NULL
                     ) = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) - (
                         SELECT billed_price FROM billable_event WHERE id = ?
                     ), 8)
                     ELSE pack_balance
                 END
             WHERE id = (
                 SELECT user_id FROM billable_event
                 WHERE id = ? AND api_key_id = ? AND settled_at IS NULL
             )`,
        )
        .bind(
            eventId,
            apiKeyId,
            eventId,
            eventId,
            apiKeyId,
            eventId,
            eventId,
            apiKeyId,
        );
}

function deductApiKeyBudget(db: D1Database, eventId: string, apiKeyId: string) {
    return db
        .prepare(
            `UPDATE apikey
             SET pollen_balance = CASE
                 WHEN pollen_balance IS NULL THEN NULL
                 ELSE ROUND(pollen_balance - (
                     SELECT billed_price FROM billable_event WHERE id = ?
                 ), 8)
             END
             WHERE id = ?
               AND EXISTS (
                   SELECT 1 FROM billable_event
                   WHERE id = ? AND api_key_id = ? AND settled_at IS NULL
               )`,
        )
        .bind(eventId, apiKeyId, eventId, apiKeyId);
}

function creditDeveloper(db: D1Database, eventId: string, apiKeyId: string) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event WHERE id = ?
                     ) = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) + (
                         SELECT dev_credit FROM billable_event WHERE id = ?
                     ), 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event WHERE id = ?
                     ) = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) + (
                         SELECT dev_credit FROM billable_event WHERE id = ?
                     ), 8)
                     ELSE pack_balance
                 END
             WHERE id = (
                 SELECT dev_user_id FROM billable_event
                 WHERE id = ? AND api_key_id = ? AND settled_at IS NULL
             )
               AND 0 <= (
                   SELECT CASE event.payer_bucket
                       WHEN 'tier' THEN COALESCE(payer.tier_balance, 0)
                       WHEN 'pack' THEN COALESCE(payer.pack_balance, 0)
                   END
                   FROM billable_event AS event
                   JOIN user AS payer ON payer.id = event.user_id
                   WHERE event.id = ?
                     AND event.api_key_id = ?
                     AND event.settled_at IS NULL
               )`,
        )
        .bind(
            eventId,
            eventId,
            eventId,
            eventId,
            eventId,
            apiKeyId,
            eventId,
            apiKeyId,
        );
}

function markSettled(
    db: D1Database,
    eventId: string,
    apiKeyId: string,
    settledAt: number,
) {
    return db
        .prepare(
            `UPDATE billable_event
             SET settled_at = ?
             WHERE id = ? AND api_key_id = ? AND settled_at IS NULL`,
        )
        .bind(settledAt, eventId, apiKeyId);
}

function storedEventMatches(
    stored: StoredEvent,
    event: PreparedEvent,
    auth: ApiKeyAuthResult,
): boolean {
    return (
        stored.apiKeyId === auth.apiKey.id &&
        stored.userId === auth.user?.id &&
        stored.requestId === event.requestId &&
        stored.meter === event.meter &&
        stored.price === event.price &&
        stored.paidOnly === (event.paidOnly ? 1 : 0) &&
        stored.occurredAt === event.occurredAt
    );
}

export async function settleBillableEvents(
    db: D1Database,
    auth: ApiKeyAuthResult,
    events: BillableEvent[],
): Promise<BillingEventResult[]> {
    if (!auth.user) throw new Error("Billable events require a user account");

    const prepared = await prepareEvents(db, auth, events);
    const settledAt = Date.now();
    const statements = prepared.flatMap((event) => [
        insertEvent(db, event, auth),
        deductUser(db, event.id, auth.apiKey.id),
        deductApiKeyBudget(db, event.id, auth.apiKey.id),
        creditDeveloper(db, event.id, auth.apiKey.id),
        markSettled(db, event.id, auth.apiKey.id, settledAt),
    ]);

    // D1 batches are transactions: the event receipt and every balance update
    // commit together, while the unique event id makes retries no-ops.
    const writes = await db.batch(statements);
    const rows = await db.batch(
        prepared.map((event) =>
            db
                .prepare(
                    `SELECT
                        id,
                        request_id AS requestId,
                        api_key_id AS apiKeyId,
                        user_id AS userId,
                        meter,
                        price,
                        billed_price AS billedPrice,
                        paid_only AS paidOnly,
                        payer_bucket AS payerBucket,
                        occurred_at AS occurredAt
                     FROM billable_event
                     WHERE id = ?`,
                )
                .bind(event.id),
        ),
    );

    return prepared.map((event, index): BillingEventResult => {
        const stored = rows[index]?.results?.[0] as StoredEvent | undefined;
        if (!stored) {
            return {
                id: event.id,
                status: "rejected",
                reason: "api_key_unavailable_or_budget_exhausted",
            };
        }
        if (!storedEventMatches(stored, event, auth)) {
            return {
                id: event.id,
                status: "conflict",
                reason: "event_id_already_used",
            };
        }
        return {
            id: event.id,
            status:
                writes[index * 5]?.meta.changes === 1 ? "settled" : "duplicate",
            billedPrice: stored.billedPrice,
            payerBucket: stored.payerBucket,
        };
    });
}
