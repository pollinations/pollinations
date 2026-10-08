// Sandboxes opted into cron-maintained leases ("keep-alive"); see
// drizzle/0071_sandbox_keep_alive.sql. The gen worker's cron ticker owns
// every column except identity: generation fences each enable epoch,
// charged_until is the monotonic watermark of lease time keep-alive already
// paid for, and claimed_at/claim_token form the ticker's expiring,
// token-fenced claim.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.ts";

export const sandboxKeepAlive = sqliteTable("sandbox_keep_alive", {
    sandboxId: text("sandbox_id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    // Fresh UUID on every enable; all ticker writes are fenced by it.
    generation: text("generation").notNull(),
    // Unixepoch seconds of lease time already paid for by keep-alive.
    chargedUntil: integer("charged_until").notNull(),
    claimedAt: integer("claimed_at", { mode: "timestamp" }),
    claimToken: text("claim_token"),
    enabledAt: integer("enabled_at", { mode: "timestamp" }).notNull(),
});

// Tick sweep state (e.g. the resumable cursor); see the migration for why
// this is D1 rather than KV.
export const sandboxKeepAliveMeta = sqliteTable("sandbox_keep_alive_meta", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});
