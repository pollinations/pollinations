import type { ApiKeyAuthResult } from "@shared/auth/api-key.ts";
import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import { MARKUP_PCT } from "@shared/billing/markup.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { resolveCommunityModelReward } from "@shared/billing/track-helpers.ts";
import type {
    BillableEvent,
    BillingAuthorization,
    BillingEventResult,
} from "@shared/schemas/billable-event.ts";
import stableStringify from "fast-json-stable-stringify";

export const BILLING_AUTHORIZATION_TTL_MS = 48 * 60 * 60 * 1000;

type PreparedEvent = BillableEvent & {
    billedPrice: number;
    devUserId: string | null;
    devCredit: number;
    communityUserId: string | null;
    communityRewardRate: number;
    communityCredit: number;
    eventFingerprint: string;
    telemetryJson: string;
};

type StoredAuthorization = {
    id: string;
    producer: string;
    requestId: string;
    model: string | null;
    apiKeyId: string;
    userId: string;
    estimatedPrice: number;
    reservedPrice: number;
    reservedBucket: "tier" | "pack";
    actualPrice: number | null;
    paidOnly: number;
    devUserId: string | null;
    markupRate: number;
    keyBudgetLimited: number;
    settledAt: number | null;
    cancelledAt: number | null;
    expiresAt: number;
};

type StoredBalances = {
    tier: number | null;
    pack: number | null;
    apiKey: number | null;
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
    eventFingerprint: string;
    occurredAt: number;
};

export type BillingAuthorizationResult =
    | {
          ok: true;
          grant: {
              id: string;
              reservedPrice: number;
              expiresAt: number;
              duplicate: boolean;
              balances: {
                  tier: number;
                  pack: number;
                  apiKey: number | null;
              };
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

const AUTHORIZATION_SELECT = `SELECT
    id,
    producer,
    request_id AS requestId,
    model,
    api_key_id AS apiKeyId,
    user_id AS userId,
    estimated_price AS estimatedPrice,
    reserved_price AS reservedPrice,
    reserved_bucket AS reservedBucket,
    actual_price AS actualPrice,
    paid_only AS paidOnly,
    dev_user_id AS devUserId,
    markup_rate AS markupRate,
    key_budget_limited AS keyBudgetLimited,
    settled_at AS settledAt,
    cancelled_at AS cancelledAt,
    expires_at AS expiresAt
FROM billing_authorization`;

function authorizationMatches(
    stored: StoredAuthorization,
    input: BillingAuthorization,
    auth: ApiKeyAuthResult,
): boolean {
    return (
        stored.producer === input.producer &&
        stored.requestId === input.requestId &&
        stored.model === (input.model ?? null) &&
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
            `${AUTHORIZATION_SELECT}
             WHERE producer = ? AND request_id = ?`,
        )
        .bind(producer, requestId)
        .first<StoredAuthorization>();
}

function apiKeyIdentity(auth: ApiKeyAuthResult) {
    const metadata = auth.apiKey.metadata ?? {};
    const isByop = !!auth.apiKey.byopClientKeyId;
    return {
        name: auth.apiKey.name ?? null,
        type: typeof metadata.keyType === "string" ? metadata.keyType : null,
        createdVia: isByop
            ? "redirect-auth"
            : typeof metadata.createdVia === "string"
              ? metadata.createdVia
              : null,
        clientId: auth.apiKey.byopClientKeyId ?? null,
        clientName: auth.apiKey.byopClientName ?? null,
        clientUserId: auth.apiKey.byopClientUserId ?? null,
    };
}

export async function authorizeBillingRequest(
    db: D1Database,
    auth: ApiKeyAuthResult,
    input: BillingAuthorization,
    now = Date.now(),
): Promise<BillingAuthorizationResult> {
    if (!auth.user) {
        throw new Error("Billing authorization requires a user account");
    }
    const allowedModels = auth.apiKey.permissions?.models;
    if (input.model && allowedModels && !allowedModels.includes(input.model)) {
        return { ok: false, error: "model_not_allowed" };
    }

    const identity = apiKeyIdentity(auth);
    const markupApplies =
        auth.apiKey.byopMarkupApplies === true &&
        identity.clientUserId !== null &&
        identity.clientUserId !== auth.user.id;
    const markupRate = markupApplies ? MARKUP_PCT : 0;
    const reservedPrice = roundPollenLedgerAmount(
        input.estimatedPrice * (1 + markupRate),
    );
    const id = crypto.randomUUID();
    const expiresAt = now + BILLING_AUTHORIZATION_TTL_MS;
    const writes = await db.batch([
        db
            .prepare(
                `INSERT INTO billing_authorization (
                    id, producer, request_id, model, api_key_id, api_key_name,
                    api_key_type, api_key_created_via, api_key_client_name,
                    api_key_client_user_id, user_id, user_tier, parent_request_id,
                    estimated_price, reserved_price, reserved_bucket, paid_only,
                    byop_client_key_id, dev_user_id, markup_rate,
                    key_budget_limited, expires_at
                )
                SELECT
                    ?, ?, ?, ?, api_key.id, ?, ?, ?, ?, ?, payer.id, payer.tier,
                    ?, ?, ?,
                    CASE
                        WHEN ? = 1 THEN 'pack'
                        WHEN COALESCE(payer.tier_balance, 0) >= ?
                             AND (? > 0 OR COALESCE(payer.tier_balance, 0) > 0)
                        THEN 'tier'
                        ELSE 'pack'
                    END,
                    ?, ?, ?, ?, api_key.pollen_balance IS NOT NULL, ?
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
                      (
                          ? = 1
                          AND COALESCE(payer.pack_balance, 0) > 0
                          AND COALESCE(payer.pack_balance, 0) >= ?
                      )
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
                input.model ?? null,
                identity.name,
                identity.type,
                identity.createdVia,
                identity.clientName,
                identity.clientUserId,
                auth.agentRun?.parentRequestId ?? null,
                input.estimatedPrice,
                reservedPrice,
                input.paidOnly ? 1 : 0,
                reservedPrice,
                reservedPrice,
                input.paidOnly ? 1 : 0,
                identity.clientId,
                markupApplies ? identity.clientUserId : null,
                markupRate,
                expiresAt,
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
                `UPDATE user
                 SET tier_balance = CASE
                         WHEN grant.reserved_bucket = 'tier'
                         THEN ROUND(COALESCE(tier_balance, 0) - grant.reserved_price, 8)
                         ELSE tier_balance
                     END,
                     pack_balance = CASE
                         WHEN grant.reserved_bucket = 'pack'
                         THEN ROUND(COALESCE(pack_balance, 0) - grant.reserved_price, 8)
                         ELSE pack_balance
                     END
                 FROM billing_authorization AS grant
                 WHERE user.id = grant.user_id
                   AND grant.id = ?
                   AND grant.reservation_applied = 0`,
            )
            .bind(id),
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
        db
            .prepare(
                `SELECT
                    payer.tier_balance AS tier,
                    payer.pack_balance AS pack,
                    api_key.pollen_balance AS apiKey
                 FROM billing_authorization AS grant
                 JOIN user AS payer ON payer.id = grant.user_id
                 LEFT JOIN apikey AS api_key ON api_key.id = grant.api_key_id
                 WHERE grant.producer = ? AND grant.request_id = ?`,
            )
            .bind(input.producer, input.requestId),
    ]);

    const stored = await getAuthorization(db, input.producer, input.requestId);
    if (!stored) {
        return { ok: false, error: "insufficient_balance_or_budget" };
    }
    if (!authorizationMatches(stored, input, auth)) {
        return { ok: false, error: "authorization_conflict" };
    }
    if (
        stored.settledAt !== null ||
        stored.cancelledAt !== null ||
        stored.expiresAt <= now
    ) {
        return { ok: false, error: "authorization_closed" };
    }
    const balances = writes[4]?.results?.[0] as StoredBalances | undefined;
    if (!balances) {
        throw new Error(`Authorization ${stored.id} has no payer balances`);
    }
    return {
        ok: true,
        grant: {
            id: stored.id,
            reservedPrice: stored.reservedPrice,
            expiresAt: stored.expiresAt,
            duplicate: writes[0]?.meta.changes !== 1,
            balances: {
                tier: balances.tier ?? 0,
                pack: balances.pack ?? 0,
                apiKey: stored.keyBudgetLimited ? balances.apiKey : null,
            },
        },
    };
}

function prepareEvents(
    authorization: StoredAuthorization,
    events: BillableEvent[],
): PreparedEvent[] {
    return events.map((event) => {
        const isOwnerRequest =
            event.communityReward?.userId === authorization.userId;
        const billablePrice = isOwnerRequest ? 0 : event.price;
        const devCredit = roundPollenLedgerAmount(
            billablePrice * authorization.markupRate,
        );
        const community = isOwnerRequest
            ? null
            : resolveCommunityModelReward(
                  event.communityReward,
                  billablePrice,
                  authorization.userId,
              );
        return {
            ...event,
            billedPrice: roundPollenLedgerAmount(billablePrice + devCredit),
            devUserId: devCredit > 0 ? authorization.devUserId : null,
            devCredit,
            communityUserId: community?.userId ?? null,
            communityRewardRate: community?.rewardRate ?? 0,
            communityCredit: community?.credit ?? 0,
            eventFingerprint: stableStringify(event),
            telemetryJson: stableStringify(event.telemetry),
        };
    });
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
                dev_credit, community_user_id, community_reward_rate,
                community_credit, event_fingerprint, telemetry_json,
                occurred_at
            )
            SELECT
                ?, grant.id, ?, grant.api_key_id, grant.user_id, ?, ?, ?, ?,
                CASE
                    WHEN ? <= 0 THEN NULL
                    ELSE grant.reserved_bucket
                END,
                ?, ?, ?, ?, ?, ?, ?, ?
            FROM billing_authorization AS grant
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
            event.devUserId,
            event.devCredit,
            event.communityUserId,
            event.communityRewardRate,
            event.communityCredit,
            event.eventFingerprint,
            event.telemetryJson,
            event.occurredAt,
            authorization.id,
            event.requestId,
            event.paidOnly ? 1 : 0,
            actualPrice,
        );
}

function suppressUnavailableCredits(
    db: D1Database,
    authorizationId: string,
    eventId: string,
) {
    return db
        .prepare(
            `UPDATE billable_event
             SET dev_user_id = CASE
                     WHEN EXISTS (SELECT 1 FROM user WHERE id = dev_user_id)
                     THEN dev_user_id ELSE NULL
                 END,
                 dev_credit = CASE
                     WHEN EXISTS (SELECT 1 FROM user WHERE id = dev_user_id)
                     THEN dev_credit ELSE 0
                 END,
                 community_user_id = CASE
                     WHEN EXISTS (SELECT 1 FROM user WHERE id = community_user_id)
                     THEN community_user_id ELSE NULL
                 END,
                 community_reward_rate = CASE
                     WHEN EXISTS (SELECT 1 FROM user WHERE id = community_user_id)
                     THEN community_reward_rate ELSE 0
                 END,
                 community_credit = CASE
                     WHEN EXISTS (SELECT 1 FROM user WHERE id = community_user_id)
                     THEN community_credit ELSE 0
                 END
             WHERE authorization_id = ? AND id = ? AND settled_at IS NULL`,
        )
        .bind(authorizationId, eventId);
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
                     WHEN event.payer_bucket = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) + event.dev_credit, 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN event.payer_bucket = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) + event.dev_credit, 8)
                     ELSE pack_balance
                 END
             FROM billable_event AS event
             WHERE user.id = event.dev_user_id
               AND event.authorization_id = ?
               AND event.id = ?
               AND event.settled_at IS NULL
               AND event.dev_credit > 0`,
        )
        .bind(authorizationId, eventId);
}

function creditCommunityOwner(
    db: D1Database,
    authorizationId: string,
    eventId: string,
) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN event.payer_bucket = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) + event.community_credit, 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN event.payer_bucket = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) + event.community_credit, 8)
                     ELSE pack_balance
                 END
             FROM billable_event AS event
             WHERE user.id = event.community_user_id
               AND event.authorization_id = ?
               AND event.id = ?
               AND event.settled_at IS NULL
               AND event.community_credit > 0`,
        )
        .bind(authorizationId, eventId);
}

function finalizeTelemetry(
    db: D1Database,
    authorizationId: string,
    eventId: string,
) {
    return db
        .prepare(
            `UPDATE billable_event
             SET telemetry_json = json_remove(
                 json_set(
                     json_patch(
                         telemetry_json,
                         CASE WHEN billed_price > 0
                             THEN '{"isBilledUsage":true}'
                             ELSE '{}'
                         END
                     ),
                     '$.id', authorization_id || ':' || id,
                     '$.eventType', meter,
                     '$.requestId', request_id,
                     '$.userId', user_id,
                     '$.userTier', (SELECT user_tier FROM billing_authorization WHERE id = authorization_id),
                     '$.parentRequestId', (SELECT parent_request_id FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyId', api_key_id,
                     '$.apiKeyName', (SELECT api_key_name FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyType', (SELECT api_key_type FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyCreatedVia', (SELECT api_key_created_via FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyClientId', (SELECT byop_client_key_id FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyCreatedForApp', (SELECT api_key_client_name FROM billing_authorization WHERE id = authorization_id),
                     '$.apiKeyCreatedForUserId', (SELECT api_key_client_user_id FROM billing_authorization WHERE id = authorization_id),
                     '$.selectedMeterId', CASE WHEN payer_bucket IS NULL THEN NULL ELSE 'local:' || payer_bucket END,
                     '$.selectedMeterSlug', CASE payer_bucket
                         WHEN 'tier' THEN 'v1:meter:tier'
                         WHEN 'pack' THEN 'v1:meter:pack'
                         ELSE NULL
                     END,
                     '$.totalPrice', billed_price,
                     '$.devPrice', price,
                     '$.markupRate', CASE WHEN price > 0 THEN dev_credit / price ELSE 0 END,
                     '$.communityModelRewardUserId', community_user_id,
                     '$.communityModelRewardRate', community_reward_rate,
                     '$.communityModelRewardAmount', community_credit
                 ),
                 CASE WHEN (SELECT parent_request_id FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.parentRequestId' ELSE '$.__keep_parent' END,
                 CASE WHEN (SELECT api_key_name FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyName' ELSE '$.__keep_name' END,
                 CASE WHEN (SELECT api_key_type FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyType' ELSE '$.__keep_type' END,
                 CASE WHEN (SELECT api_key_created_via FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyCreatedVia' ELSE '$.__keep_created' END,
                 CASE WHEN (SELECT byop_client_key_id FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyClientId' ELSE '$.__keep_client' END,
                 CASE WHEN (SELECT api_key_client_name FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyCreatedForApp' ELSE '$.__keep_client_name' END,
                 CASE WHEN (SELECT api_key_client_user_id FROM billing_authorization WHERE id = authorization_id) IS NULL THEN '$.apiKeyCreatedForUserId' ELSE '$.__keep_client_user' END,
                 CASE WHEN payer_bucket IS NULL THEN '$.selectedMeterId' ELSE '$.__keep_meter_id' END,
                 CASE WHEN payer_bucket IS NULL THEN '$.selectedMeterSlug' ELSE '$.__keep_meter_slug' END,
                 CASE WHEN community_user_id IS NULL THEN '$.communityModelRewardUserId' ELSE '$.__keep_reward_user' END
             )
             WHERE authorization_id = ? AND id = ? AND settled_at IS NULL`,
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
    now: number,
) {
    return db
        .prepare(
            `UPDATE billing_authorization
             SET actual_price = ?
             WHERE id = ?
               AND actual_price IS NULL
               AND settled_at IS NULL
               AND cancelled_at IS NULL
               AND expires_at > ?
               AND EXISTS (
                   SELECT 1 FROM user AS payer
                   WHERE payer.id = billing_authorization.user_id
                     AND (
                         ? <= billing_authorization.reserved_price
                         OR (
                             billing_authorization.reserved_bucket = 'tier'
                             AND COALESCE(payer.tier_balance, 0) >= ? - billing_authorization.reserved_price
                         )
                         OR (
                             billing_authorization.reserved_bucket = 'pack'
                             AND COALESCE(payer.pack_balance, 0) >= ? - billing_authorization.reserved_price
                         )
                     )
               )
               AND (
                   key_budget_limited = 0
                   OR ? <= reserved_price
                   OR EXISTS (
                       SELECT 1 FROM apikey
                       WHERE id = billing_authorization.api_key_id
                         AND enabled = 1
                         AND (expires_at IS NULL OR expires_at > unixepoch())
                         AND pollen_balance >= ? - billing_authorization.reserved_price
                   )
               )`,
        )
        .bind(
            actualPrice,
            authorization.id,
            now,
            actualPrice,
            actualPrice,
            actualPrice,
            actualPrice,
            actualPrice,
        );
}

function reconcileWalletReservation(
    db: D1Database,
    authorization: StoredAuthorization,
    actualPrice: number,
) {
    return db
        .prepare(
            `UPDATE user
             SET tier_balance = CASE
                     WHEN grant.reserved_bucket = 'tier'
                     THEN ROUND(COALESCE(tier_balance, 0) - (? - grant.reserved_price), 8)
                     ELSE tier_balance
                 END,
                 pack_balance = CASE
                     WHEN grant.reserved_bucket = 'pack'
                     THEN ROUND(COALESCE(pack_balance, 0) - (? - grant.reserved_price), 8)
                     ELSE pack_balance
                 END
             FROM billing_authorization AS grant
             WHERE user.id = grant.user_id
               AND grant.id = ?
               AND grant.reservation_applied = 1
               AND grant.actual_price = ?
               AND grant.settled_at IS NULL
               AND grant.cancelled_at IS NULL`,
        )
        .bind(actualPrice, actualPrice, authorization.id, actualPrice);
}

function reconcileApiKeyReservation(
    db: D1Database,
    authorization: StoredAuthorization,
    actualPrice: number,
) {
    return db
        .prepare(
            `UPDATE apikey
             SET pollen_balance = ROUND(pollen_balance - (? - ?), 8)
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

function markAutoTopUpRequired(db: D1Database, authorizationId: string) {
    return db
        .prepare(
            `UPDATE billable_event
             SET auto_top_up_required = 1,
                 auto_top_up_next_attempt_at = 0
             WHERE authorization_id = ?
               AND id = (
                   SELECT id FROM billable_event
                   WHERE authorization_id = ?
                     AND payer_bucket = 'pack'
                     AND billed_price > 0
                   ORDER BY occurred_at DESC, id DESC
                   LIMIT 1
               )
               AND EXISTS (
                   SELECT 1 FROM user
                   WHERE id = billable_event.user_id
                     AND auto_top_up_enabled = 1
                     AND auto_top_up_amount_usd IS NOT NULL
                     AND COALESCE(pack_balance, 0) <= ?
               )`,
        )
        .bind(authorizationId, authorizationId, AUTO_TOP_UP_THRESHOLD_POLLEN);
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
        stored.billedPrice === event.billedPrice &&
        stored.paidOnly === (event.paidOnly ? 1 : 0) &&
        stored.eventFingerprint === event.eventFingerprint &&
        stored.occurredAt === event.occurredAt
    );
}

export async function settleBillableEvents(
    db: D1Database,
    authorizationId: string,
    events: BillableEvent[],
    now = Date.now(),
): Promise<BillingEventResult[]> {
    const authorization = await db
        .prepare(`${AUTHORIZATION_SELECT} WHERE id = ?`)
        .bind(authorizationId)
        .first<StoredAuthorization>();
    if (
        !authorization ||
        authorization.cancelledAt !== null ||
        (authorization.settledAt === null && authorization.expiresAt <= now)
    ) {
        return events.map((event) => ({
            id: event.id,
            status: "rejected",
            reason: "authorization_unavailable",
        }));
    }

    const prepared = prepareEvents(authorization, events);
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
    const statements: D1PreparedStatement[] = [
        approveActualPrice(db, authorization, actualPrice, now),
        reconcileWalletReservation(db, authorization, actualPrice),
        reconcileApiKeyReservation(db, authorization, actualPrice),
    ];
    const insertIndexes: number[] = [];
    for (const event of prepared) {
        insertIndexes.push(statements.length);
        statements.push(
            insertEvent(db, event, authorization, actualPrice),
            suppressUnavailableCredits(db, authorization.id, event.id),
            creditDeveloper(db, authorization.id, event.id),
            creditCommunityOwner(db, authorization.id, event.id),
            finalizeTelemetry(db, authorization.id, event.id),
            markEventSettled(db, authorization.id, event.id, now),
        );
    }
    statements.push(markAutoTopUpRequired(db, authorization.id));
    statements.push(markAuthorizationSettled(db, authorization.id, now));

    // D1 batches are transactions: receipts, wallet/key updates, credits, and
    // the telemetry payload used by the derived write commit together.
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
                        event_fingerprint AS eventFingerprint,
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
                writes[insertIndexes[index] ?? -1]?.meta.changes === 1
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
    now = Date.now(),
): Promise<boolean> {
    const writes = await db.batch([
        db
            .prepare(
                `UPDATE user
                 SET tier_balance = CASE
                         WHEN grant.reserved_bucket = 'tier'
                         THEN ROUND(COALESCE(tier_balance, 0) + grant.reserved_price, 8)
                         ELSE tier_balance
                     END,
                     pack_balance = CASE
                         WHEN grant.reserved_bucket = 'pack'
                         THEN ROUND(COALESCE(pack_balance, 0) + grant.reserved_price, 8)
                         ELSE pack_balance
                     END
                 FROM billing_authorization AS grant
                 WHERE user.id = grant.user_id
                   AND grant.id = ?
                   AND grant.reservation_applied = 1
                   AND grant.settled_at IS NULL
                   AND grant.cancelled_at IS NULL`,
            )
            .bind(authorizationId),
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
            .bind(now, authorizationId),
    ]);
    return writes[2]?.meta.changes === 1;
}

export async function writeBillingTelemetry(
    env: {
        DB: D1Database;
        TINYBIRD_INGEST_URL: string;
        TINYBIRD_INGEST_TOKEN: string;
    },
    authorizationId: string,
    eventResults: BillingEventResult[],
): Promise<void> {
    const ids = eventResults.flatMap((event) =>
        event.status === "settled" ? [event.id] : [],
    );
    if (ids.length === 0) return;
    try {
        const rows = await env.DB.batch(
            ids.map((id) =>
                env.DB.prepare(
                    `SELECT telemetry_json AS telemetryJson
                     FROM billable_event
                     WHERE authorization_id = ? AND id = ?`,
                ).bind(authorizationId, id),
            ),
        );
        const body = rows
            .map(({ results }) => results[0] as { telemetryJson: string })
            .map(({ telemetryJson }) => telemetryJson)
            .join("\n");
        const response = await fetch(env.TINYBIRD_INGEST_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
                "Content-Type": "application/x-ndjson",
            },
            body,
        });
        if (!response.ok) {
            throw new Error(
                `Tinybird ${response.status}: ${(await response.text()).slice(0, 500)}`,
            );
        }
    } catch (error) {
        console.error("[billing] Tinybird write failed", {
            authorizationId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
