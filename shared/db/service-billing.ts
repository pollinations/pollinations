// Service billing: authorizations and settled events for trusted services
// that bill through Enter's ServiceGateway instead of holding their own
// billing pipeline. An authorization snapshots the identity a settlement
// needs (so settling never re-authenticates the raw token — revoking a key
// after authorization cannot make completed authorized work free) and tracks
// the not-yet-reconciled slice of a finite API-key budget reservation.
// Settled events are the idempotency ledger: one row per
// (authorization, eventId), so retried or batch-redelivered settlements
// debit exactly once.

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
        // Whether the key had a finite pollen budget: settlement must then
        // reconcile against the reservation instead of debiting the key raw.
        apiKeyHasBudget: integer("api_key_has_budget", { mode: "boolean" })
            .notNull()
            .default(false),
        // Reserved-but-unsettled budget. Settlement nets the first settled
        // price against it and releases the rest back to the key.
        reservedRemaining: real("reserved_remaining").notNull().default(0),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        settledAt: integer("settled_at", { mode: "timestamp" }),
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
        billedPrice: real("billed_price").notNull().default(0),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.authorizationId, table.eventId] }),
    ],
);
