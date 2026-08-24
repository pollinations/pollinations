// Service billing: authorizations and billable events for trusted services
// that bill through Enter's ServiceGateway instead of holding their own
// billing pipeline. An authorization snapshots the identity a settlement
// needs (so settling never re-authenticates the raw token — revoking a key
// after authorization cannot make completed authorized work free) and holds a
// finite API-key budget reservation until exactly one event, a cancel, or the
// expiry sweep claims it. Billing events are the idempotency ledger: one row
// per (authorization, eventId), and money moves atomically with the claim.

import {
    integer,
    primaryKey,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** `reservationHolder` sentinel: the reservation was released by a cancel. */
export const RESERVATION_CANCELED = "__canceled__";
/** `reservationHolder` sentinel: the reservation was released by the expiry sweep. */
export const RESERVATION_EXPIRED = "__expired__";

export const serviceAuthorization = sqliteTable(
    "service_authorization",
    {
        id: text("id").primaryKey(),
        // Producing service + its request id; one authorization per request.
        service: text("service").notNull(),
        requestId: text("request_id").notNull(),
        requestPath: text("request_path").notNull(),
        // Identity snapshot taken at authorization time. Deliberately not a
        // foreign key: settlement of authorized work must survive the key
        // (or even the user row) disappearing in between.
        userId: text("user_id").notNull(),
        userTier: text("user_tier"),
        apiKeyId: text("api_key_id").notNull(),
        apiKeyName: text("api_key_name"),
        apiKeyType: text("api_key_type"),
        byopClientKeyId: text("byop_client_key_id"),
        paidOnly: integer("paid_only", { mode: "boolean" })
            .notNull()
            .default(false),
        // Whether the key had a finite pollen budget: settlement must then
        // reconcile against the reservation instead of debiting the key raw.
        apiKeyHasBudget: integer("api_key_has_budget", { mode: "boolean" })
            .notNull()
            .default(false),
        // Amount reserved from the key budget at authorize time (immutable).
        // Estimate the caller authorized (after BYOP markup); a retried
        // authorize must repeat it exactly to reuse the authorization.
        estimatedPrice: real("estimated_price").notNull().default(0),
        reservedPrice: real("reserved_price").notNull().default(0),
        // Who claimed the reservation: the settling event's id, or a release
        // sentinel. NULL means the reservation is still outstanding. Set
        // atomically (compare-and-set on NULL) so exactly one claimer wins.
        reservationHolder: text("reservation_holder"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        // After this, the expiry sweep may release an unclaimed reservation
        // (the service died without settling or canceling). Settlement still
        // works afterwards — it just reconciles against a zero reservation.
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
        settledAt: integer("settled_at", { mode: "timestamp" }),
        canceledAt: integer("canceled_at", { mode: "timestamp" }),
    },
    (table) => [
        uniqueIndex("idx_service_authorization_request").on(
            table.service,
            table.requestId,
        ),
    ],
);

export const serviceBillingEvent = sqliteTable(
    "service_billing_event",
    {
        authorizationId: text("authorization_id").notNull(),
        eventId: text("event_id").notNull(),
        eventType: text("event_type").notNull(),
        // 'claimed' while the settlement batch is moving money, 'settled'
        // once it committed. Every money statement is guarded on 'claimed',
        // so a retried settlement after commit cannot move money again.
        status: text("status").notNull(),
        // Financial payload fingerprint: reusing an event id with a different
        // price/type/model/reward is a conflict, not a duplicate.
        fingerprint: text("fingerprint").notNull().default(""),
        // Service-reported price and the amount actually debited from the
        // payer (price + BYOP markup, capped by a finite key budget).
        price: real("price").notNull().default(0),
        billedPrice: real("billed_price").notNull().default(0),
        payerBucket: text("payer_bucket"),
        modelUsed: text("model_used"),
        // BYOP markup / community reward actually credited (zeroed when
        // suppressed or capped, so the ledger matches the money that moved).
        devUserId: text("dev_user_id"),
        devCredit: real("dev_credit").notNull().default(0),
        markupRate: real("markup_rate").notNull().default(0),
        communityRewardUserId: text("community_reward_user_id"),
        communityRewardCredit: real("community_reward_credit")
            .notNull()
            .default(0),
        communityRewardRate: real("community_reward_rate").notNull().default(0),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.authorizationId, table.eventId] }),
    ],
);
