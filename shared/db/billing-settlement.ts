// Durable record of a charge whose wallet write failed after the response was
// already sent. Gen and MCP settle billing after answering the caller, so a
// failed write used to leave the generation unbilled with only a log line.
//
// `request_id` is the idempotency key. A retry claims the row
// (`pending`/`failed` -> `settling`) before moving money, so two concurrent
// retries cannot charge the same generation twice. A row left in `settling`
// means a worker died between the claim and the result: it is deliberately not
// retried, because the debit may already have happened.

import {
    index,
    integer,
    real,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";

export const billingSettlement = sqliteTable(
    "billing_settlement",
    {
        requestId: text("request_id").primaryKey(),
        userId: text("user_id").notNull(),
        apiKeyId: text("api_key_id"),
        // Inputs needed to replay the same charge. `totalPrice` is the priced
        // response cost before BYOP markup, so the retry recomputes the exact
        // billed price instead of freezing an amount that never reached the
        // ledger.
        isBilledUsage: integer("is_billed_usage", {
            mode: "boolean",
        }).notNull(),
        totalPrice: real("total_price").notNull(),
        apiKeyPollenBalance: real("api_key_pollen_balance"),
        byopClientKeyId: text("byop_client_key_id"),
        modelPaidOnly: integer("model_paid_only", { mode: "boolean" })
            .notNull()
            .default(false),
        questPollenOnly: integer("quest_pollen_only", { mode: "boolean" })
            .notNull()
            .default(false),
        // JSON CommunityModelRewardInput, when the served endpoint earns one.
        communityModelReward: text("community_model_reward"),
        requestPath: text("request_path"),
        environment: text("environment"),
        // pending  -> recorded; no retry has touched it yet
        // settling -> a retry claimed it; never reclaimable
        // settled  -> the charge reached the ledger
        // failed   -> a retry ran and the debit failed again; retryable
        status: text("status", {
            enum: ["pending", "settling", "settled", "failed"],
        })
            .notNull()
            .default("pending"),
        attempts: integer("attempts").notNull().default(0),
        lastError: text("last_error"),
        billedPrice: real("billed_price"),
        payerBucket: text("payer_bucket"),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
        settledAt: integer("settled_at", { mode: "timestamp" }),
    },
    (table) => [
        index("idx_billing_settlement_status_created").on(
            table.status,
            table.createdAt,
        ),
    ],
);
