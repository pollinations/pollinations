import type { ApiKeyAuthResult } from "@shared/auth/api-key.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { resolveDevMarkup } from "@shared/billing/track-helpers.ts";
import type {
    BillableEvent,
    BillingAuthorization,
} from "@shared/schemas/billable-event.ts";
import { drizzle } from "drizzle-orm/d1";

type PreparedEvent = BillableEvent & {
    billedPrice: number;
    devUserId: string | null;
    devCredit: number;
};

type StoredAuthorization = {
    id: string;
    producer: string;
    requestId: string;
    apiKeyId: string;
    userId: string;
    estimatedPrice: number;
    reservedPrice: number;
    actualPrice: number | null;
    paidOnly: number;
    byopClientKeyId: string | null;
    keyBudgetLimited: number;
    settledAt: number | null;
    cancelledAt: number | null;
};

type StoredEvent = {
    id: string;
    authorizationId: string;
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

export type BillingAuthorizationResult =
    | {
          ok: true;
          grant: {
              id: string;
              reservedPrice: number;
              duplicate: boolean;
          };
      }
    | {
          ok: false;
          error:
              | "authorization_conflict"
              | "authorization_closed"
              | "insufficient_balance_or_budget"
              | "model_not_allowed";
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
          reason: "authorization_unavailable";
      }
    | {
          id: string;
          status: "conflict";
          reason: "event_id_already_used";
      };

function authorizationMatches(
    stored: StoredAuthorization,
    input: BillingAuthorization,
    auth: ApiKeyAuthResult,
): boolean {
    return (
        stored.producer === input.producer &&
        stored.requestId === input.requestId &&
        stored.apiKeyId === auth.apiKey.id &&
        stored.userId === auth.user?.id &&
        stored.estimatedPrice === input.estimatedPrice &&
        stored.paidOnly === (input.paidOnly ? 1 : 0)
    );
}

async function getAuthorization(
    db: D1Database,
    producer: string,
    requestId: string,
): Promise<StoredAuthorization | null> {
    return db
        .prepare(
            `SELECT
                id,
                producer,
                request_id AS requestId,
                api_key_id AS apiKeyId,
                user_id AS userId,
                estimated_price AS estimatedPrice,
                reserved_price AS reservedPrice,
                actual_price AS actualPrice,
                paid_only AS paidOnly,
                byop_client_key_id AS byopClientKeyId,
                key_budget_limited AS keyBudgetLimited,
                settled_at AS settledAt,
                cancelled_at AS cancelledAt
             FROM billing_authorization
             WHERE producer = ? AND request_id = ?`,
        )
        .bind(producer, requestId)
        .first<StoredAuthorization>();
}

export async function authorizeBillingRequest(
    db: D1Database,
    auth: ApiKeyAuthResult,
    input: BillingAuthorization,
): Promise<BillingAuthorizationResult> {
    if (!auth.user) {
        throw new Error("Billing authorization requires a user account");
    }
    const allowedModels = auth.apiKey.permissions?.models;
    if (input.model && allowedModels && !allowedModels.includes(input.model)) {
        return { ok: false, error: "model_not_allowed" };
    }

    const balanceDb = drizzle(db);
    const markup = await resolveDevMarkup(
        balanceDb,
        auth.apiKey.byopClientKeyId,
        input.estimatedPrice,
        auth.user.id,
    );
    const reservedPrice = roundPollenLedgerAmount(
        input.estimatedPrice + (markup?.devCredit ?? 0),
    );
    const id = crypto.randomUUID();
    const writes = await db.batch([
        db
            .prepare(
                `INSERT INTO billing_authorization (
                id, producer, request_id, api_key_id, user_id,
                estimated_price, reserved_price, paid_only,
                byop_client_key_id, key_budget_limited
            )
            SELECT
                ?, ?, ?, api_key.id, payer.id, ?, ?, ?, ?,
                api_key.pollen_balance IS NOT NULL
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
              AND (
                  (? = 1 AND COALESCE(payer.pack_balance, 0) > ?)
                  OR (
                      ? = 0
                      AND (
                          COALESCE(payer.tier_balance, 0) >= ?
                          OR COALESCE(payer.pack_balance, 0) >= ?
                      )
                  )
              )
            ON CONFLICT(producer, request_id) DO NOTHING`,
            )
            .bind(
                id,
                input.producer,
                input.requestId,
                input.estimatedPrice,
                reservedPrice,
                input.paidOnly ? 1 : 0,
                auth.apiKey.byopClientKeyId ?? null,
                auth.apiKey.id,
                auth.user.id,
                reservedPrice,
                input.paidOnly ? 1 : 0,
                reservedPrice,
                input.paidOnly ? 1 : 0,
                reservedPrice,
                reservedPrice,
            ),
        db
            .prepare(
                `UPDATE apikey
             SET pollen_balance = ROUND(pollen_balance - ?, 8)
             WHERE id = ?
               AND pollen_balance IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM billing_authorization
                   WHERE id = ? AND reservation_applied = 0
               )`,
            )
            .bind(reservedPrice, auth.apiKey.id, id),
        db
            .prepare(
                `UPDATE billing_authorization
             SET reservation_applied = 1
             WHERE id = ? AND reservation_applied = 0`,
            )
            .bind(id),
    ]);

    const stored = await getAuthorization(db, input.producer, input.requestId);
    if (!stored) {
        return { ok: false, error: "insufficient_balance_or_budget" };
    }
    if (!authorizationMatches(stored, input, auth)) {
        return { ok: false, error: "authorization_conflict" };
    }
    if (stored.settledAt !== null || stored.cancelledAt !== null) {
        return { ok: false, error: "authorization_closed" };
    }
    return {
        ok: true,
        grant: {
            id: stored.id,
            reservedPrice: stored.reservedPrice,
            duplicate: writes[0]?.meta.changes !== 1,
        },
    };
}

async function prepareEvents(
    db: D1Database,
    authorization: StoredAuthorization,
    events: BillableEvent[],
): Promise<PreparedEvent[]> {
    const balanceDb = drizzle(db);
    return Promise.all(
        events.map(async (event) => {
            const markup = await resolveDevMarkup(
                balanceDb,
                authorization.byopClientKeyId,
                event.price,
                authorization.userId,
            );
            const devCredit = markup?.devCredit ?? 0;
            return {
                ...event,
                billedPrice: roundPollenLedgerAmount(event.price + devCredit),
                devUserId: markup?.devUserId ?? null,
                devCredit,
            };
        }),
    );
}

function insertEvent(
    db: D1Database,
    event: PreparedEvent,
    authorization: StoredAuthorization,
    actualPrice: number,
): D1PreparedStatement {
    return db
        .prepare(
            `INSERT INTO billable_event (
                id, authorization_id, request_id, api_key_id, user_id, meter,
                price, billed_price, paid_only, payer_bucket, dev_user_id,
                dev_credit, occurred_at
            )
            SELECT
                ?, grant.id, ?, grant.api_key_id, grant.user_id, ?, ?, ?, ?,
                CASE
                    WHEN ? <= 0 THEN NULL
                    WHEN ? = 1 THEN 'pack'
                    WHEN COALESCE(payer.tier_balance, 0) >= ? THEN 'tier'
                    WHEN COALESCE(payer.pack_balance, 0) > 0 THEN 'pack'
                    ELSE 'tier'
                END,
                ?, ?, ?
            FROM billing_authorization AS grant
            JOIN user AS payer ON payer.id = grant.user_id
            WHERE grant.id = ?
              AND grant.request_id = ?
              AND grant.paid_only = ?
              AND grant.actual_price = ?
              AND grant.settled_at IS NULL
              AND grant.cancelled_at IS NULL
            ON CONFLICT(authorization_id, id) DO NOTHING`,
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
            authorization.id,
            event.requestId,
            event.paidOnly ? 1 : 0,
            actualPrice,
        );
}

function deductUser(db: D1Database, authorizationId: string, eventId: string) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE authorization_id = ? AND id = ? AND settled_at IS NULL
                     ) = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) - (
                         SELECT billed_price FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ), 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE authorization_id = ? AND id = ? AND settled_at IS NULL
                     ) = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) - (
                         SELECT billed_price FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ), 8)
                     ELSE pack_balance
                 END
             WHERE id = (
                 SELECT user_id FROM billable_event
                 WHERE authorization_id = ? AND id = ? AND settled_at IS NULL
             )`,
        )
        .bind(
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
        );
}

function creditDeveloper(
    db: D1Database,
    authorizationId: string,
    eventId: string,
) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ) = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) + (
                         SELECT dev_credit FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ), 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN (
                         SELECT payer_bucket FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ) = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) + (
                         SELECT dev_credit FROM billable_event
                         WHERE authorization_id = ? AND id = ?
                     ), 8)
                     ELSE pack_balance
                 END
             WHERE id = (
                 SELECT dev_user_id FROM billable_event
                 WHERE authorization_id = ? AND id = ? AND settled_at IS NULL
             )
               AND 0 <= (
                   SELECT CASE event.payer_bucket
                       WHEN 'tier' THEN COALESCE(payer.tier_balance, 0)
                       WHEN 'pack' THEN COALESCE(payer.pack_balance, 0)
                   END
                   FROM billable_event AS event
                   JOIN user AS payer ON payer.id = event.user_id
                   WHERE event.authorization_id = ?
                     AND event.id = ?
                     AND event.settled_at IS NULL
               )`,
        )
        .bind(
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
            authorizationId,
            eventId,
        );
}

function suppressUnavailableDeveloperCredit(
    db: D1Database,
    authorizationId: string,
    eventId: string,
) {
    return db
        .prepare(
            `UPDATE billable_event
             SET dev_user_id = NULL, dev_credit = 0
             WHERE authorization_id = ?
               AND id = ?
               AND settled_at IS NULL
               AND dev_credit > 0
               AND (
                   NOT EXISTS (
                       SELECT 1 FROM user
                       WHERE id = billable_event.dev_user_id
                   )
                   OR 0 > (
                       SELECT CASE billable_event.payer_bucket
                           WHEN 'tier' THEN COALESCE(payer.tier_balance, 0)
                           WHEN 'pack' THEN COALESCE(payer.pack_balance, 0)
                       END
                       FROM user AS payer
                       WHERE payer.id = billable_event.user_id
                   )
               )`,
        )
        .bind(authorizationId, eventId);
}

function markEventSettled(
    db: D1Database,
    authorizationId: string,
    eventId: string,
    settledAt: number,
) {
    return db
        .prepare(
            `UPDATE billable_event
             SET settled_at = ?
             WHERE authorization_id = ? AND id = ? AND settled_at IS NULL`,
        )
        .bind(settledAt, authorizationId, eventId);
}

function approveActualPrice(
    db: D1Database,
    authorization: StoredAuthorization,
    actualPrice: number,
) {
    return db
        .prepare(
            `UPDATE billing_authorization
             SET actual_price = ?
             WHERE id = ?
               AND actual_price IS NULL
               AND settled_at IS NULL
               AND cancelled_at IS NULL
               AND (
                   key_budget_limited = 0
                   OR ? <= billing_authorization.reserved_price
                   OR EXISTS (
                       SELECT 1 FROM apikey
                       WHERE id = billing_authorization.api_key_id
                         AND pollen_balance >= MAX(
                             0,
                             ? - billing_authorization.reserved_price
                         )
                   )
               )`,
        )
        .bind(actualPrice, authorization.id, actualPrice, actualPrice);
}

function reconcileApiKeyReservation(
    db: D1Database,
    authorization: StoredAuthorization,
    actualPrice: number,
) {
    return db
        .prepare(
            `UPDATE apikey
             SET pollen_balance = ROUND(
                 pollen_balance - (? - ?),
                 8
             )
             WHERE id = ?
               AND ? = 1
               AND EXISTS (
                   SELECT 1 FROM billing_authorization
                   WHERE id = ?
                     AND actual_price = ?
                     AND settled_at IS NULL
                     AND cancelled_at IS NULL
               )`,
        )
        .bind(
            actualPrice,
            authorization.reservedPrice,
            authorization.apiKeyId,
            authorization.keyBudgetLimited,
            authorization.id,
            actualPrice,
        );
}

function markAuthorizationSettled(
    db: D1Database,
    authorizationId: string,
    settledAt: number,
) {
    return db
        .prepare(
            `UPDATE billing_authorization
             SET settled_at = ?
             WHERE id = ?
               AND actual_price IS NOT NULL
               AND settled_at IS NULL
               AND cancelled_at IS NULL`,
        )
        .bind(settledAt, authorizationId);
}

function storedEventMatches(
    stored: StoredEvent,
    event: PreparedEvent,
    authorization: StoredAuthorization,
): boolean {
    return (
        stored.authorizationId === authorization.id &&
        stored.apiKeyId === authorization.apiKeyId &&
        stored.userId === authorization.userId &&
        stored.requestId === event.requestId &&
        stored.meter === event.meter &&
        stored.price === event.price &&
        stored.paidOnly === (event.paidOnly ? 1 : 0) &&
        stored.occurredAt === event.occurredAt
    );
}

export async function settleBillableEvents(
    db: D1Database,
    authorizationId: string,
    events: BillableEvent[],
): Promise<BillingEventResult[]> {
    const authorization = await db
        .prepare(
            `SELECT
                id,
                producer,
                request_id AS requestId,
                api_key_id AS apiKeyId,
                user_id AS userId,
                estimated_price AS estimatedPrice,
                reserved_price AS reservedPrice,
                actual_price AS actualPrice,
                paid_only AS paidOnly,
                byop_client_key_id AS byopClientKeyId,
                key_budget_limited AS keyBudgetLimited,
                settled_at AS settledAt,
                cancelled_at AS cancelledAt
             FROM billing_authorization WHERE id = ?`,
        )
        .bind(authorizationId)
        .first<StoredAuthorization>();
    if (!authorization || authorization.cancelledAt !== null) {
        return events.map((event) => ({
            id: event.id,
            status: "rejected",
            reason: "authorization_unavailable",
        }));
    }

    const prepared = await prepareEvents(db, authorization, events);
    if (
        prepared.some(
            (event) =>
                event.requestId !== authorization.requestId ||
                (event.paidOnly ? 1 : 0) !== authorization.paidOnly,
        )
    ) {
        return prepared.map((event) => ({
            id: event.id,
            status: "rejected",
            reason: "authorization_unavailable",
        }));
    }
    const actualPrice = roundPollenLedgerAmount(
        prepared.reduce((sum, event) => sum + event.billedPrice, 0),
    );
    const settledAt = Date.now();
    const statements = [
        approveActualPrice(db, authorization, actualPrice),
        reconcileApiKeyReservation(db, authorization, actualPrice),
        ...prepared.flatMap((event) => [
            insertEvent(db, event, authorization, actualPrice),
            deductUser(db, authorization.id, event.id),
            suppressUnavailableDeveloperCredit(db, authorization.id, event.id),
            creditDeveloper(db, authorization.id, event.id),
            markEventSettled(db, authorization.id, event.id, settledAt),
        ]),
        markAuthorizationSettled(db, authorization.id, settledAt),
    ];

    // D1 batches are transactions: event receipts, wallet updates, and budget
    // reconciliation commit together. Grant-scoped event ids make retries no-ops.
    const writes = await db.batch(statements);
    const rows = await db.batch(
        prepared.map((event) =>
            db
                .prepare(
                    `SELECT
                        id,
                        authorization_id AS authorizationId,
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
                     WHERE authorization_id = ? AND id = ?`,
                )
                .bind(authorization.id, event.id),
        ),
    );

    return prepared.map((event, index): BillingEventResult => {
        const stored = rows[index]?.results?.[0] as StoredEvent | undefined;
        if (!stored) {
            return {
                id: event.id,
                status: "rejected",
                reason: "authorization_unavailable",
            };
        }
        if (!storedEventMatches(stored, event, authorization)) {
            return {
                id: event.id,
                status: "conflict",
                reason: "event_id_already_used",
            };
        }
        return {
            id: event.id,
            status:
                writes[2 + index * 5]?.meta.changes === 1
                    ? "settled"
                    : "duplicate",
            billedPrice: stored.billedPrice,
            payerBucket: stored.payerBucket,
        };
    });
}

export async function cancelBillingAuthorization(
    db: D1Database,
    authorizationId: string,
): Promise<boolean> {
    const cancelledAt = Date.now();
    const writes = await db.batch([
        db
            .prepare(
                `UPDATE apikey
             SET pollen_balance = ROUND(pollen_balance + (
                 SELECT reserved_price FROM billing_authorization WHERE id = ?
             ), 8)
             WHERE id = (
                 SELECT api_key_id FROM billing_authorization
                 WHERE id = ?
                   AND key_budget_limited = 1
                   AND reservation_applied = 1
                   AND settled_at IS NULL
                   AND cancelled_at IS NULL
             )`,
            )
            .bind(authorizationId, authorizationId),
        db
            .prepare(
                `UPDATE billing_authorization
             SET cancelled_at = ?
             WHERE id = ? AND settled_at IS NULL AND cancelled_at IS NULL`,
            )
            .bind(cancelledAt, authorizationId),
    ]);
    return writes[1]?.meta.changes === 1;
}
