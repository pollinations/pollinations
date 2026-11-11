// Sandboxes gen keeps running until their timeout, 10 minutes at a time
// (gen's routes/e2b.ts). E2B's metadata is set once at create, so the keep
// lives here: a timeout or pause changes it.

import {
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";
import { apikey } from "./better-auth.ts";

export const sandboxKeep = sqliteTable("sandbox_keep", {
    sandboxId: text("sandbox_id").primaryKey(),
    // The key that set the timeout pays every renewal; without one (set from
    // the dashboard), the sandbox's owner does.
    apiKeyId: text("api_key_id").references(() => apikey.id, {
        onDelete: "cascade",
    }),
    until: integer("until", { mode: "timestamp" }).notNull(),
    // Opt-in: the cron pauses the sandbox after this many seconds without
    // activity and leaves the keep, so the next wake resumes it.
    idleTimeout: integer("idle_timeout"),
    // The last activity gen saw: a request to a shared port, or a connect
    // or timeout by the owner. The cron also counts the sandbox's own key.
    activeAt: integer("active_at", { mode: "timestamp" }),
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

// Sandbox ports gen serves at <port>-<sandbox id>.pollinations.app (gen's
// routes/e2b.ts): a request wakes the sandbox, paid in advance like a connect.
export const sandboxPort = sqliteTable(
    "sandbox_port",
    {
        sandboxId: text("sandbox_id").notNull(),
        port: integer("port").notNull(),
        // As for a keep: the key that shared the port pays each wake; without
        // one (shared from the dashboard), the sandbox's owner does.
        apiKeyId: text("api_key_id").references(() => apikey.id, {
            onDelete: "cascade",
        }),
        // Requests carry the share's secret in this header (lowercase); gen
        // keeps only its SHA-256.
        header: text("header").notNull(),
        secretHash: text("secret_hash").notNull(),
    },
    (table) => [primaryKey({ columns: [table.sandboxId, table.port] })],
);
