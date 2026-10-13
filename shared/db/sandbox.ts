// Sandboxes kept running past E2B's 24-hour run (gen's routes/e2b.ts). E2B's
// metadata is set once at create, so the keep lives here: a timeout or pause
// changes it.

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
