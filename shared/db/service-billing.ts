// Service billing: authorizations and billable events for trusted services
// that bill through Enter's ServiceGateway instead of holding their own
// billing pipeline. An authorization snapshots the identity a settlement
// needs (so settling never re-authenticates the raw token — revoking a key
// after authorization cannot make completed authorized work free), fixes the
// wallet bucket the whole request pays from, and holds the estimate reserved
// from that bucket (and from a finite API-key budget) until the first
// settlement, a cancel, or the expiry sweep reconciles it. Billing events are
// the idempotency ledger: one row per (authorization, eventId), and money
// moves atomically with the claim.

import {
    integer,
    primaryKey,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

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
        // Whether the key had a finite pollen budget: the reserve was then
        // also taken from the key, and settlement reconciles the key with
        // the wallet so the two never disagree.
        apiKeyHasBudget: integer("api_key_has_budget", { mode: "boolean" })
            .notNull()
            .default(false),
        // The one wallet bucket ('tier' | 'pack') every event of this
        // request is billed from, chosen at authorize time.
        payerBucket: text("payer_bucket").notNull(),
        // Estimate the caller authorized (after BYOP markup), debited from
        // the wallet bucket and the key budget at authorize time. Immutable:
        // a retried authorize must repeat it exactly to reuse the
        // authorization.
        reservedPrice: real("reserved_price").notNull().default(0),
        // Amount currently collected from the wallet (and the key). Starts
        // at the reserve; the first settlement reconciles it down to the
        // settled total, later ones raise both together.
        chargedPrice: real("charged_price").notNull().default(0),
        // Running total of settled billed prices across all events.
        settledPrice: real("settled_price").notNull().default(0),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        // After this, the expiry sweep may release an unreconciled reserve
        // (the service died without settling or canceling) and settlement
        // is refused.
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
        // Set by the first settlement, once the reserve is reconciled.
        settledAt: integer("settled_at", { mode: "timestamp" }),
        canceledAt: integer("canceled_at", { mode: "timestamp" }),
        // Set when the reserve was released as expired, by the sweep or by
        // a late settlement.
        expiredAt: integer("expired_at", { mode: "timestamp" }),
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
