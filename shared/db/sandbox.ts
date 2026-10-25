// Sandboxes gen keeps running until their timeout, 10 minutes at a time
// (gen's routes/e2b.ts). E2B's metadata is set once at create, so the keep
// lives here: a timeout or pause changes it.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

// Gen's Azure sandboxes (gen's routes/azure-sandboxes.ts): what E2B keeps for
// each sandbox and Azure doesn't. Azure keeps the box itself.
export const azureSandbox = sqliteTable(
    "azure_sandbox",
    {
        sandboxId: text("sandbox_id").primaryKey(),
        userId: text("user_id").notNull(),
        templateId: text("template_id").notNull(),
        metadata: text("metadata", { mode: "json" })
            .$type<Record<string, string>>()
            .notNull(),
        // Azure never returns a sandbox's environment, where envd gets it.
        envdAccessToken: text("envd_access_token").notNull(),
        // When the run started, and when its lease ends: gen's cron stops the
        // sandbox then, as E2B's timeout would.
        startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
        endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
    },
    (table) => [index("azure_sandbox_user_id_idx").on(table.userId)],
);
