// Sandboxes gen keeps running until their timeout, 10 minutes at a time
// (gen's routes/e2b.ts). E2B's metadata is set once at create, so the keep
// lives here: a timeout or pause changes it.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { apikey } from "./better-auth.ts";

export const sandboxKeep = sqliteTable("sandbox_keep", {
    sandboxId: text("sandbox_id").primaryKey(),
    // The key that set the timeout pays every renewal; without one (set from
    // the dashboard), the sandbox's owner does.
    apiKeyId: text("api_key_id").references(() => apikey.id, {
        onDelete: "cascade",
    }),
    until: integer("until", { mode: "timestamp" }).notNull(),
});

// Sandboxes that E2B resumes by itself on traffic (auto-resume). Gen never
// sees such a wake, so it records how far each sandbox is paid, and its cron
// charges every woken run past that.
export const sandboxWake = sqliteTable("sandbox_wake", {
    sandboxId: text("sandbox_id").primaryKey(),
    // The key that created the sandbox pays for its wakes; without one (the
    // dashboard), the owner does. No foreign key: deleting the key must not
    // drop the row, or the sandbox would wake for free. The cron kills it.
    apiKeyId: text("api_key_id"),
    paidUntil: integer("paid_until", { mode: "timestamp_ms" }).notNull(),
});
